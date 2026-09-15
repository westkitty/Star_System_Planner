/**
 * Primary Simulation Engine Orchestrator.
 *
 * Manages:
 * - Fixed sub-stepping integration
 * - Time scale management (Pause, 1x, 10x, 100x, 1000x, 10000x)
 * - Collision checking and momentum resolution
 * - Thermal updates
 * - Event ledger accumulation
 * - Debris particle lifetimes
 */

import { CelestialBody, ConsequenceEvent, SimulationSnapshot, AsteroidBelt, HookshotRoute, SystemStatus } from './types';
import { stepVelocityVerlet } from './integrator';
import { resolveCollisions, CollisionDebrisParticle } from './collisions';
import { updateBodyTemperatures } from './thermal';
import { PLANNER_CONFIG, stepSizeForTimeScale } from '../core/config';
import { eventBus } from '../core/event-bus';
import { createId } from '../core/id';
import { G_KM } from './units';

export interface SimulationEngineConfig {
  enableCollisions: boolean;
  baseSubsteps: number;
}

export interface EngineTickStats {
  physicsMs: number;
  collisionMs: number;
  thermalMs: number;
  substeps: number;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class SimulationEngine {
  public bodies: CelestialBody[] = [];
  public belts: AsteroidBelt[] = [];
  public hookshotRoutes: HookshotRoute[] = [];
  public debris: CollisionDebrisParticle[] = [];
  public events: ConsequenceEvent[] = [];

  public timeSec: number = 0;
  public timeScale: number = 1.0; // 1x by default
  public isPaused: boolean = false;
  public enableCollisions: boolean = true;
  /** Retained forensic control surface; future Roche checks are opt-in. */
  public enableRocheBreaking: boolean = false;
  public systemStatus: SystemStatus = 'active';
  /** Strength of the latest collision for renderer and sonification feedback. */
  public pendingImpactStrength = 0;
  /** Optional single-fire catastrophe notification for the UI layer. */
  public onCatastrophe?: (event: ConsequenceEvent) => void;
  private eventSeq = 0;

  private accumulatorSec: number = 0;
  private maxSubstepsPerTick: number = PLANNER_CONFIG.physics.maxSubstepsPerTick;
  private lastTickStats: EngineTickStats = { physicsMs: 0, collisionMs: 0, thermalMs: 0, substeps: 0 };

  /** Clamp and apply a time scale; returns the applied value (iteration 3, BACK14). */
  public setTimeScale(scale: number): number {
    this.timeScale = normalizeTimeScale(scale);
    return this.timeScale;
  }

  /** Subsystem timing of the most recent tick (BACK11 diagnostics). */
  public getLastTickStats(): EngineTickStats {
    return { ...this.lastTickStats };
  }

  constructor(initialBodies: CelestialBody[] = [], config?: Partial<SimulationEngineConfig>) {
    this.bodies = initialBodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } }));
    if (config?.enableCollisions !== undefined) {
      this.enableCollisions = config.enableCollisions;
    }
    updateBodyTemperatures(this.bodies);
  }

  /**
   * Advance simulation by real-world delta time in seconds.
   */
  public update(realDeltaSec: number): void {
    if (this.isPaused || !Number.isFinite(this.timeScale) || this.timeScale <= 0) return;

    // Cap delta time to prevent spiral of death on tab switch / lag
    const clampedRealDt = Math.min(PLANNER_CONFIG.physics.maxRealDeltaSec, Math.max(0.001, realDeltaSec));
    const simDt = clampedRealDt * this.timeScale;

    // Adaptive fixed step from central tuning ladder (BACK12).
    const stepSize = stepSizeForTimeScale(this.timeScale);

    this.accumulatorSec += simDt;
    let substepsDone = 0;
    let physicsMs = 0;
    let collisionMs = 0;

    while (this.accumulatorSec >= stepSize && substepsDone < this.maxSubstepsPerTick) {
      const t0 = nowMs();
      const ok = stepVelocityVerlet(this.bodies, stepSize);
      physicsMs += nowMs() - t0;
      if (!ok) {
        this.isPaused = true;
        const event = this.pushEvent({
          timestampSec: this.timeSec,
          type: 'orbit_unbound',
          title: 'Simulation Instability Detected',
          description: 'Calculations encountered NaN or infinite divergence. Simulation has been paused to protect state.',
          severity: 'catastrophe',
        });
        this.fireCatastrophe(event);
        break;
      }

      this.timeSec += stepSize;
      this.accumulatorSec -= stepSize;
      substepsDone++;

      // Check collisions at regular intervals
      if (this.enableCollisions && this.bodies.length > 1) {
        const t0 = nowMs();
        const colResults = resolveCollisions(this.bodies, this.timeSec, this.debris);
        collisionMs += nowMs() - t0;
        for (const cr of colResults) {
          const event = this.pushEvent(cr.event);
          this.pendingImpactStrength = Math.max(this.pendingImpactStrength, Math.min(1, cr.relativeSpeedKmS / 80));
          if (event.severity === 'catastrophe') this.fireCatastrophe(event);
          eventBus.emit('collision:occurred', {
            eventId: cr.event.id,
            bodyIds: cr.event.bodyIds ?? [],
            timestampSec: this.timeSec,
          });
        }
      }
    }

    // Residual clamp to prevent lag buildup
    if (this.accumulatorSec > stepSize * 2) {
      this.accumulatorSec = 0;
    }

    // Update debris particle lifetimes
    if (this.debris.length > 0) {
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.lifetimeRemainingSec -= clampedRealDt;
        d.position.x += d.velocity.x * clampedRealDt * 10;
        d.position.y += d.velocity.y * clampedRealDt * 10;
        d.position.z += d.velocity.z * clampedRealDt * 10;
        if (d.lifetimeRemainingSec <= 0) {
          this.debris.splice(i, 1);
        }
      }
    }

    // Update body thermal state periodically
    const tThermal = nowMs();
    updateBodyTemperatures(this.bodies);
    const thermalMs = nowMs() - tThermal;

    // GAME11: station-keeping autopilot + tick timing ledger.
    this.applyStationKeeping();
    this.lastTickStats = { physicsMs, collisionMs, thermalMs, substeps: substepsDone };
  }

  /**
   * Station-keeping (GAME11): bodies flagged `stationKeeping` spend
   * station thrust to hold near-circular orbits, blending planet-relative
   * velocity toward circular when eccentricity drifts past tolerance.
   */
  private applyStationKeeping(): void {
    for (const body of this.bodies) {
      if (!body.stationKeeping || body.fixed) continue;
      const primary = body.primaryId
        ? this.bodies.find((b) => b.id === body.primaryId) ?? null
        : null;
      if (!primary || primary.id === body.id) continue;
      const rx = body.position.x - primary.position.x;
      const ry = body.position.y - primary.position.y;
      const rz = body.position.z - primary.position.z;
      const r = Math.hypot(rx, ry, rz);
      if (!(r > 0)) continue;
      const vx = body.velocity.x - primary.velocity.x;
      const vy = body.velocity.y - primary.velocity.y;
      const vz = body.velocity.z - primary.velocity.z;
      // Specific angular momentum h = r × v.
      const hx = ry * vz - rz * vy;
      const hy = rz * vx - rx * vz;
      const hz = rx * vy - ry * vx;
      const h = Math.hypot(hx, hy, hz);
      if (!(h > 1e-9)) continue;
      const mu = G_KM * primary.massKg;
      const vCirc = Math.sqrt(mu / r);
      const speed = Math.hypot(vx, vy, vz);
      // Outside a 4% band around circular speed: blend back toward it.
      if (Math.abs(speed - vCirc) / vCirc > 0.04) {
        // Prograde unit = (h × r) / |h × r|.
        const px = (hy * rz - hz * ry);
        const py = (hz * rx - hx * rz);
        const pz = (hx * ry - hy * rx);
        const pm = Math.hypot(px, py, pz) || 1;
        const blend = 0.12;
        body.velocity = {
          x: primary.velocity.x + vx * (1 - blend) + (px / pm) * vCirc * blend,
          y: primary.velocity.y + vy * (1 - blend) + (py / pm) * vCirc * blend,
          z: primary.velocity.z + vz * (1 - blend) + (pz / pm) * vCirc * blend,
        };
      }
    }
  }

  public addBody(body: CelestialBody): void {
    this.bodies.push({ ...body, position: { ...body.position }, velocity: { ...body.velocity } });
    updateBodyTemperatures(this.bodies);
    this.events.push({
      id: createId('add'),
      timestampSec: this.timeSec,
      type: 'body_created',
      title: `Created Body: ${body.name}`,
      description: `${body.name} (${body.type}) placed with mass ${body.massKg.toExponential(2)} kg.`,
      bodyIds: [body.id],
      severity: 'info',
    });
    eventBus.emit('body:created', { bodyId: body.id, name: body.name, type: body.type });
  }

  public removeBody(id: string): void {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx !== -1) {
      const removed = this.bodies.splice(idx, 1)[0];
      this.events.push({
        id: createId('rm'),
        timestampSec: this.timeSec,
        type: 'body_removed',
        title: `Removed Body: ${removed.name}`,
        description: `${removed.name} removed from active simulation.`,
        bodyIds: [id],
        severity: 'info',
      });
      updateBodyTemperatures(this.bodies);
      eventBus.emit('body:removed', { bodyId: id, name: removed.name });
    }
  }

  /**
   * Advance exactly one adaptive physics step while paused (GAME01).
   * Frame-stepping for precise slingshot setup and collision forensics.
   */
  public stepOnce(): boolean {
    const stepSize = stepSizeForTimeScale(Math.max(1, this.timeScale));
    const ok = stepVelocityVerlet(this.bodies, stepSize);
    if (!ok) return false;
    this.timeSec += stepSize;
    this.accumulatorSec = 0;
    if (this.enableCollisions && this.bodies.length > 1) {
      const colResults = resolveCollisions(this.bodies, this.timeSec, this.debris);
      for (const cr of colResults) {
        const event = this.pushEvent(cr.event);
        this.pendingImpactStrength = Math.max(this.pendingImpactStrength, Math.min(1, cr.relativeSpeedKmS / 80));
        if (event.severity === 'catastrophe') this.fireCatastrophe(event);
        eventBus.emit('collision:occurred', {
          eventId: cr.event.id,
          bodyIds: cr.event.bodyIds ?? [],
          timestampSec: this.timeSec,
        });
      }
    }
    updateBodyTemperatures(this.bodies);
    return true;
  }

  /** Return and clear the latest impact signal. */
  public consumeImpactStrength(): number {
    const value = this.pendingImpactStrength;
    this.pendingImpactStrength = 0;
    return value;
  }

  private fireCatastrophe(event: ConsequenceEvent): void {
    try { this.onCatastrophe?.(event); } catch { /* callback failures cannot corrupt simulation */ }
  }

  /** Append a bounded causal ledger entry. */
  public pushEvent(event: Omit<ConsequenceEvent, 'id'> & { id?: string }): ConsequenceEvent {
    const full: ConsequenceEvent = { ...event, id: event.id ?? createId(`event-${++this.eventSeq}`) };
    this.events.push(full);
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
    return full;
  }

  public createSnapshot(): SimulationSnapshot {
    return {
      timestampSec: this.timeSec,
      systemStatus: this.systemStatus,
      bodies: JSON.parse(JSON.stringify(this.bodies)),
      belts: JSON.parse(JSON.stringify(this.belts)),
      hookshotRoutes: JSON.parse(JSON.stringify(this.hookshotRoutes)),
    };
  }

  public restoreSnapshot(snapshot: SimulationSnapshot): void {
    this.timeSec = snapshot.timestampSec;
    this.systemStatus = snapshot.systemStatus || 'active';
    this.accumulatorSec = 0;
    this.bodies = JSON.parse(JSON.stringify(snapshot.bodies));
    this.belts = JSON.parse(JSON.stringify(snapshot.belts ?? []));
    this.hookshotRoutes = JSON.parse(JSON.stringify(snapshot.hookshotRoutes ?? []));
    updateBodyTemperatures(this.bodies);
  }
}

/** Tablet-safe time acceleration bounds. */
export const MIN_TIME_SCALE = 1;
export const MAX_TIME_SCALE = 100000;

/**
 * Normalize a requested time scale (iteration 3, BACK14).
 *
 * Sliders, palette verbs, and persisted sessions can all hand the engine
 * NaN, infinities, or out-of-ladder values; the clamp keeps the integrator
 * honest instead of wedged or accidentally frozen.
 */
export function normalizeTimeScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_TIME_SCALE;
  return Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, scale));
}
