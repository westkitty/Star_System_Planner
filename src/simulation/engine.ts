/**
 * Primary Simulation Engine Orchestrator.
 *
 * Manages:
 * - Fixed sub-stepping integration with adaptive step-size policy
 * - Smooth (slewed) time-scale transitions up to 100,000×
 * - Single-step (frame advance) analysis while paused
 * - Collision checking, momentum resolution, debris, Roche fragmentation
 * - Orbital regime monitors (ejection, Hill-sphere flips)
 * - Two-impulse transfer autopilot programs
 * - Bounded causal event ledger
 * - Thermal updates
 */

import { CelestialBody, ConsequenceEvent, SimulationSnapshot, AsteroidBelt, HookshotRoute, SystemStatus, RingStructure } from './types';
import { stepVelocityVerlet } from './integrator';
import { resolveCollisions, CollisionDebrisParticle } from './collisions';
import { updateBodyTemperatures } from './thermal';
import {
  findDominantPrimary,
  calculateRocheLimitKm,
  calculateOsculatingElements,
  calculateBarycenter,
} from './orbital-mechanics';
import {
  MAX_LEDGER_EVENTS,
  EJECTION_DISTANCE_AU,
  ROCHE_BREAKING_ENABLED_DEFAULT,
  ROCHE_CHECK_RADIUS_FACTOR,
  ROCHE_MIN_RADIUS_KM,
  TIME_SCALE_SLEW_PER_SEC,
  AUTOPILOT_ARRIVAL_TOLERANCE,
} from './tuning';
import { KM_PER_AU } from './units';
import { AutopilotProgram, planTransfer, executeDepartureBurn, advanceAutopilot } from './autopilot';

export interface SimulationEngineConfig {
  enableCollisions: boolean;
  baseSubsteps: number;
}

/**
 * Adaptive fixed-step sizing policy. Higher commanded rates use wider steps so the
 * per-frame substep budget stays bounded on a tablet CPU.
 */
export function pickStepSizeSec(timeScale: number): number {
  if (timeScale >= 50000) return 3600 * 8; // 8 hours
  if (timeScale >= 10000) return 3600 * 4; // 4 hours
  if (timeScale >= 1000) return 3600; // 1 hour
  if (timeScale >= 100) return 600; // 10 minutes
  if (timeScale >= 10) return 120; // 2 minutes
  return 60; // 1 minute
}

/** Deterministic xorshift PRNG used for cosmetic scatter (debris), keeping exports reproducible. */
export function makeDeterministicRng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export class SimulationEngine {
  public bodies: CelestialBody[] = [];
  public belts: AsteroidBelt[] = [];
  public hookshotRoutes: HookshotRoute[] = [];
  public debris: CollisionDebrisParticle[] = [];
  public events: ConsequenceEvent[] = [];

  public timeSec: number = 0;
  /** Commanded time rate (what the UI asked for). */
  public timeScale: number = 1.0;
  /** Effective (eased) time rate actually integrated. */
  public effectiveTimeScale: number = 1.0;
  public isPaused: boolean = false;
  public enableCollisions: boolean = true;
  public enableRocheBreaking: boolean = ROCHE_BREAKING_ENABLED_DEFAULT;
  public systemStatus: SystemStatus = 'active';

  /** Active transfer autopilot programs keyed by ship id. */
  public autopilotPrograms: Map<string, AutopilotProgram> = new Map();

  private accumulatorSec: number = 0;
  private eventSeq: number = 0;
  private maxSubstepsPerTick: number = 96; // Safety budget per frame

  // Regime monitor latches (prevent event spam): which ids already reported.
  private ejectedLatch: Set<string> = new Set();
  private hillFlipLatch: Map<string, string> = new Map(); // bodyId -> dominantPrimaryId
  private debrisRand: () => number = makeDeterministicRng(1337);

  constructor(initialBodies: CelestialBody[] = [], config?: Partial<SimulationEngineConfig>) {
    this.bodies = initialBodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } }));
    if (config?.enableCollisions !== undefined) {
      this.enableCollisions = config.enableCollisions;
    }
    updateBodyTemperatures(this.bodies);
  }

  /**
   * Command a new time scale. The effective rate eases toward it to avoid
   * integrator shock when jumping from 1× to 100,000×.
   */
  public setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(500000, scale));
    if (this.timeScale <= 0) {
      this.effectiveTimeScale = 0;
    }
  }

  /** Single-step analysis: advance exactly one fixed physics step (works while paused). */
  public stepOnce(): void {
    const stepSize = pickStepSizeSec(Math.max(1, this.timeScale));
    const ok = stepVelocityVerlet(this.bodies, stepSize);
    if (!ok) {
      this.guardInstability();
      return;
    }
    this.timeSec += stepSize;
    this.runCollisionPass();
    this.runRegimeMonitors();
    updateBodyTemperatures(this.bodies);
  }

  /**
   * Advance simulation by real-world delta time in seconds.
   */
  public update(realDeltaSec: number): void {
    if (this.isPaused || this.timeScale <= 0) return;

    // Cap delta time to prevent spiral of death on tab switch / lag
    const clampedRealDt = Math.min(0.1, Math.max(0.001, realDeltaSec));

    // Ease effective rate toward commanded rate (smooth time-warp transitions)
    const slew = Math.min(1.0, clampedRealDt * TIME_SCALE_SLEW_PER_SEC);
    this.effectiveTimeScale += (this.timeScale - this.effectiveTimeScale) * slew;
    if (Math.abs(this.effectiveTimeScale - this.timeScale) / Math.max(1, this.timeScale) < 0.01) {
      this.effectiveTimeScale = this.timeScale;
    }

    const simDt = clampedRealDt * this.effectiveTimeScale;
    const stepSize = pickStepSizeSec(this.effectiveTimeScale);

    this.accumulatorSec += simDt;
    let substepsDone = 0;

    while (this.accumulatorSec >= stepSize && substepsDone < this.maxSubstepsPerTick) {
      const ok = stepVelocityVerlet(this.bodies, stepSize);
      if (!ok) {
        this.guardInstability();
        break;
      }

      this.timeSec += stepSize;
      this.accumulatorSec -= stepSize;
      substepsDone++;

      this.runCollisionPass();
    }

    // Residual clamp to prevent lag buildup
    if (this.accumulatorSec > stepSize * 2) {
      this.accumulatorSec = 0;
    }

    // Orbital regime monitors run once per rendered frame (cheap O(n))
    this.runRegimeMonitors();

    // Advance transfer autopilot programs
    if (this.autopilotPrograms.size > 0) {
      const completed: string[] = [];
      for (const [shipId, program] of this.autopilotPrograms) {
        const ship = this.bodies.find(b => b.id === shipId);
        const primary = this.bodies.find(b => b.id === program.primaryId);
        if (!ship || !primary) {
          completed.push(shipId);
          continue;
        }
        const active = advanceAutopilot(program, ship, primary, AUTOPILOT_ARRIVAL_TOLERANCE);
        if (!active) {
          completed.push(shipId);
          if (program.stage === 'done') {
            this.pushEvent({
              timestampSec: this.timeSec,
              type: 'body_created',
              title: `Transfer Complete: ${ship.name}`,
              description: `${ship.name} circularized into its destination orbit at ${(program.insertionRadiusKm / KM_PER_AU).toFixed(3)} AU from ${primary.name}.`,
              bodyIds: [ship.id, primary.id],
              severity: 'info',
            });
          }
        }
      }
      for (const id of completed) {
        this.autopilotPrograms.delete(id);
      }
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
    updateBodyTemperatures(this.bodies);
  }

  private guardInstability(): void {
    this.isPaused = true;
    this.pushEvent({
      timestampSec: this.timeSec,
      type: 'orbit_unbound',
      title: 'Simulation Instability Detected',
      description: 'Calculations encountered NaN or infinite divergence. Simulation has been paused to protect state.',
      severity: 'catastrophe',
    });
  }

  private runCollisionPass(): void {
    if (this.enableCollisions && this.bodies.length > 1) {
      const colResults = resolveCollisions(this.bodies, this.timeSec, this.debris);
      for (const cr of colResults) {
        const ev = this.pushEvent(cr.event);
        // Camera/audio feedback hook read by the UI layer
        this.pendingImpactStrength = Math.max(this.pendingImpactStrength, Math.min(1, cr.relativeSpeedKmS / 80));
        if (ev.severity === 'catastrophe') this.fireCatastrophe(ev);
      }
      if (this.enableRocheBreaking) {
        this.runRochePass();
      }
    }
  }

  /** Strength (0..1) of the most recent impact this frame; consumed by the renderer. */
  public pendingImpactStrength: number = 0;
  public consumeImpactStrength(): number {
    const v = this.pendingImpactStrength;
    this.pendingImpactStrength = 0;
    return v;
  }

  /**
   * Catastrophe hook: fired once per catastrophic event (collision, Roche
   * fragmentation, instability). The UI layer uses it for haptic/audio
   * feedback, auto-pause, and catastrophe-reversal bookkeeping.
   */
  public onCatastrophe?: (event: ConsequenceEvent) => void;

  private fireCatastrophe(event: ConsequenceEvent): void {
    try {
      this.onCatastrophe?.(event);
    } catch (err) {
      console.error('Catastrophe hook consumer failed:', err);
    }
  }

  /**
   * Roche fragmentation: a body that crosses inside the rigid Roche limit of a
   * significantly more massive companion is torn apart into a crystalline debris
   * ring (plus debris particles) instead of silently interpenetrating.
   */
  private runRochePass(): void {
    if (this.bodies.length < 2) return;
    const shattered: CelestialBody[] = [];

    for (const body of this.bodies) {
      if (body.fixed || body.type === 'star' || body.type === 'black_hole') continue;
      if (body.radiusKm < ROCHE_MIN_RADIUS_KM) continue;

      const primary = findDominantPrimary(body, this.bodies);
      if (!primary || primary.id === body.id) continue;

      const dx = primary.position.x - body.position.x;
      const dy = primary.position.y - body.position.y;
      const dz = primary.position.z - body.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Cheap gate before running the roche computation
      if (dist > (primary.radiusKm + body.radiusKm) * ROCHE_CHECK_RADIUS_FACTOR) continue;

      const roche = calculateRocheLimitKm(primary, body);
      if (roche !== null && dist < roche) {
        shattered.push(body);

        const inner = Math.max(primary.radiusKm * 1.05, roche * 0.88);
        const outer = roche * 1.22;
        const ring: RingStructure = {
          id: `roche-ring-${body.id}-${Math.round(this.timeSec)}`,
          name: `${body.name} Debris Ring`,
          innerRadiusKm: inner,
          outerRadiusKm: outer,
          normal: { x: 0, y: 1, z: 0 },
          color: body.color || '#9aa5b1',
          opacity: 0.8,
        };
        if (!primary.rings) primary.rings = [];
        primary.rings.push(ring);

        // Scatter debris streaks along the breakup point
        const rand = this.debrisRand;
        for (let p = 0; p < 20; p++) {
          const a1 = rand() * Math.PI * 2;
          const a2 = (rand() - 0.5) * Math.PI;
          const speed = 3 + rand() * 7;
          this.debris.push({
            id: `roche-debris-${Math.round(this.timeSec)}-${p}`,
            position: { ...body.position },
            velocity: {
              x: body.velocity.x + Math.cos(a1) * Math.cos(a2) * speed,
              y: body.velocity.y + Math.sin(a2) * speed,
              z: body.velocity.z + Math.sin(a1) * Math.cos(a2) * speed,
            },
            color: body.color || '#9aa5b1',
            lifetimeRemainingSec: 20,
            initialLifetimeSec: 20,
            sizeKm: Math.max(12, body.radiusKm * 0.08),
          });
        }

        this.pushEvent({
          timestampSec: this.timeSec,
          type: 'roche_violation',
          title: `Roche Violation: ${body.name} Fragmented`,
          description: `${body.name} crossed inside the rigid Roche limit of ${primary.name} (${(roche / 1000).toFixed(0)}k km) and was torn into an orbital debris ring.`,
          bodyIds: [body.id, primary.id],
          severity: 'catastrophe',
        });
      }
    }

    if (shattered.length > 0) {
      const ids = new Set(shattered.map(b => b.id));
      this.bodies = this.bodies.filter(b => !ids.has(b.id));
      this.pendingImpactStrength = Math.max(this.pendingImpactStrength, 0.7);
    }
  }

  /**
   * Detect bodies that have been ejected from the system or whose dominant
   * primary has flipped (Hill-sphere regime change). Latched so each regime
   * transition is reported exactly once.
   */
  private runRegimeMonitors(): void {
    if (this.bodies.length < 2) return;
    const bary = calculateBarycenter(this.bodies);
    const ejectionDistKm = EJECTION_DISTANCE_AU * KM_PER_AU;

    for (const body of this.bodies) {
      if (body.fixed || body.type === 'star' || body.type === 'black_hole') continue;

      // --- Ejection monitor ---
      const dx = body.position.x - bary.x;
      const dy = body.position.y - bary.y;
      const dz = body.position.z - bary.z;
      const distBary = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distBary > ejectionDistKm && !this.ejectedLatch.has(body.id)) {
        const primary = findDominantPrimary(body, this.bodies);
        let hyperbolic = true;
        if (primary) {
          const el = calculateOsculatingElements(body, primary);
          hyperbolic = el.isHyperbolicEscape;
        }
        if (hyperbolic) {
          this.ejectedLatch.add(body.id);
          this.pushEvent({
            timestampSec: this.timeSec,
            type: 'orbit_unbound',
            title: `System Ejection: ${body.name}`,
            description: `${body.name} passed ${EJECTION_DISTANCE_AU} AU from the system barycenter on a hyperbolic escape trajectory. It will not return.`,
            bodyIds: [body.id],
            severity: 'caution',
          });
        }
      } else if (distBary <= ejectionDistKm && this.ejectedLatch.has(body.id)) {
        this.ejectedLatch.delete(body.id);
      }

      // --- Hill-sphere flip monitor ---
      if (!body.primaryId) {
        // Establish baseline for bodies without an explicit primary
        const base = findDominantPrimary(body, this.bodies);
        if (base) this.hillFlipLatch.set(body.id, base.id);
        continue;
      }
      const declared = this.bodies.find(b => b.id === body.primaryId);
      const dominant = findDominantPrimary(body, this.bodies);
      if (!dominant || !declared) continue;

      const prev = this.hillFlipLatch.get(body.id) ?? dominant.id;
      if (dominant.id !== declared.id && dominant.id !== prev) {
        this.pushEvent({
          timestampSec: this.timeSec,
          type: 'hill_instability',
          title: `Hill Regime Shift: ${body.name}`,
          description: `${body.name} now orbits inside the gravitational domain of ${dominant.name} instead of ${declared.name}. Its declared primary is no longer its dynamical master.`,
          bodyIds: [body.id, dominant.id, declared.id],
          severity: 'caution',
        });
        this.hillFlipLatch.set(body.id, dominant.id);
      } else if (dominant.id === declared.id) {
        this.hillFlipLatch.set(body.id, dominant.id);
      }
    }
  }

  /**
   * Command a transfer autopilot: validates a shared primary, plans a two-impulse
   * transfer, and applies the departure burn immediately.
   * Returns an error message when the maneuver is not flyable, otherwise null.
   */
  public startTransferAutopilot(shipId: string, targetId: string): string | null {
    const ship = this.bodies.find(b => b.id === shipId);
    const target = this.bodies.find(b => b.id === targetId);
    if (!ship || !target) return 'Ship or target not found.';
    if (ship.id === target.id) return 'A body cannot transfer to itself.';
    if (ship.fixed) return 'Anchored bodies cannot execute transfers.';

    const shipPrimary = findDominantPrimary(ship, this.bodies);
    const targetPrimary = findDominantPrimary(target, this.bodies);
    if (!shipPrimary || !targetPrimary || shipPrimary.id !== targetPrimary.id) {
      return 'Ship and target must share the same dominant primary for a two-impulse transfer.';
    }

    const plan = planTransfer(ship, target, shipPrimary);
    if (!plan) return 'Transfer geometry degenerates: craft is already co-orbital with the target.';

    executeDepartureBurn(ship, shipPrimary, plan.departDeltaVKmS);

    this.autopilotPrograms.set(ship.id, {
      shipId: ship.id,
      targetId: target.id,
      primaryId: shipPrimary.id,
      insertionRadiusKm: plan.insertionRadiusKm,
      stage: 'transfer',
      outbound: plan.insertionRadiusKm > 0 && this.distanceBetween(ship.position, shipPrimary.position) < plan.insertionRadiusKm,
    });

    this.pushEvent({
      timestampSec: this.timeSec,
      type: 'body_created',
      title: `Transfer Burn: ${ship.name} → ${target.name}`,
      description: `${ship.name} executed a ${Math.abs(plan.departDeltaVKmS).toFixed(2)} km/s departure burn toward ${target.name}. Circularization in approximately ${(plan.transferTimeSec / 86400).toFixed(1)} days.`,
      bodyIds: [ship.id, target.id, shipPrimary.id],
      severity: 'info',
    });

    return null;
  }

  /** Engage manual impulsive factor burn (prograde/retrograde) on a body. */
  public applyImpulseBurn(bodyId: string, deltaVKmS: number): void {
    const body = this.bodies.find(b => b.id === bodyId);
    if (!body || body.fixed) return;
    const v = body.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed <= 1e-6) return;
    const s = deltaVKmS / speed;
    body.velocity.x += v.x * s;
    body.velocity.y += v.y * s;
    body.velocity.z += v.z * s;
    this.pushEvent({
      timestampSec: this.timeSec,
      type: 'throw_released',
      title: `Impulse Burn: ${body.name}`,
      description: `${body.name} performed a manual ${deltaVKmS >= 0 ? 'prograde' : 'retrograde'} burn of ${Math.abs(deltaVKmS).toFixed(2)} km/s.`,
      bodyIds: [body.id],
      severity: 'info',
    });
  }

  private distanceBetween(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Append an event to the causal ledger with a monotonic sequence and bounded
   * retention so decade-long sessions cannot grow memory without bound.
   */
  public pushEvent(event: Omit<ConsequenceEvent, 'id'> & { id?: string }): ConsequenceEvent {
    this.eventSeq++;
    const full: ConsequenceEvent = {
      ...event,
      id: event.id ?? `ev-${Math.round(this.timeSec)}-${this.eventSeq}`,
    };
    this.events.push(full);
    if (this.events.length > MAX_LEDGER_EVENTS) {
      this.events.splice(0, this.events.length - MAX_LEDGER_EVENTS);
    }
    return full;
  }

  public addBody(body: CelestialBody): void {
    this.bodies.push({ ...body, position: { ...body.position }, velocity: { ...body.velocity } });
    updateBodyTemperatures(this.bodies);
    this.pushEvent({
      timestampSec: this.timeSec,
      type: 'body_created',
      title: `Created Body: ${body.name}`,
      description: `${body.name} (${body.type}) placed with mass ${body.massKg.toExponential(2)} kg.`,
      bodyIds: [body.id],
      severity: 'info',
    });
  }

  public removeBody(id: string): void {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx !== -1) {
      const removed = this.bodies.splice(idx, 1)[0];
      this.autopilotPrograms.delete(id);
      this.ejectedLatch.delete(id);
      this.hillFlipLatch.delete(id);
      this.pushEvent({
        timestampSec: this.timeSec,
        type: 'body_removed',
        title: `Removed Body: ${removed.name}`,
        description: `${removed.name} removed from active simulation.`,
        bodyIds: [id],
        severity: 'info',
      });
      updateBodyTemperatures(this.bodies);
    }
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
    this.autopilotPrograms.clear();
    this.ejectedLatch.clear();
    this.hillFlipLatch.clear();
    this.debris = [];
    updateBodyTemperatures(this.bodies);
  }
}
