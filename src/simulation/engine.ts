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

export interface SimulationEngineConfig {
  enableCollisions: boolean;
  baseSubsteps: number;
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
  public systemStatus: SystemStatus = 'active';

  private accumulatorSec: number = 0;
  private readonly fixedStepSec: number = 60.0; // 1 minute fixed physics step
  private maxSubstepsPerTick: number = 64; // Safety budget per frame

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
    if (this.isPaused || this.timeScale <= 0) return;

    // Cap delta time to prevent spiral of death on tab switch / lag
    const clampedRealDt = Math.min(0.1, Math.max(0.001, realDeltaSec));
    const simDt = clampedRealDt * this.timeScale;

    // Determine appropriate fixed step size for current time acceleration
    let stepSize = this.fixedStepSec;
    if (this.timeScale >= 10000) {
      stepSize = 3600 * 4; // 4 hours per step at extreme speeds
    } else if (this.timeScale >= 1000) {
      stepSize = 3600; // 1 hour
    } else if (this.timeScale >= 100) {
      stepSize = 600; // 10 minutes
    } else if (this.timeScale >= 10) {
      stepSize = 120; // 2 minutes
    }

    this.accumulatorSec += simDt;
    let substepsDone = 0;

    while (this.accumulatorSec >= stepSize && substepsDone < this.maxSubstepsPerTick) {
      const ok = stepVelocityVerlet(this.bodies, stepSize);
      if (!ok) {
        this.isPaused = true;
        this.events.push({
          id: `nan-${Date.now()}`,
          timestampSec: this.timeSec,
          type: 'orbit_unbound',
          title: 'Simulation Instability Detected',
          description: 'Calculations encountered NaN or infinite divergence. Simulation has been paused to protect state.',
          severity: 'catastrophe',
        });
        break;
      }

      this.timeSec += stepSize;
      this.accumulatorSec -= stepSize;
      substepsDone++;

      // Check collisions at regular intervals
      if (this.enableCollisions && this.bodies.length > 1) {
        const colResults = resolveCollisions(this.bodies, this.timeSec, this.debris);
        for (const cr of colResults) {
          this.events.push(cr.event);
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
    updateBodyTemperatures(this.bodies);
  }

  public addBody(body: CelestialBody): void {
    this.bodies.push({ ...body, position: { ...body.position }, velocity: { ...body.velocity } });
    updateBodyTemperatures(this.bodies);
    this.events.push({
      id: `add-${Date.now()}-${body.id}`,
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
      this.events.push({
        id: `rm-${Date.now()}-${id}`,
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
    updateBodyTemperatures(this.bodies);
  }
}
