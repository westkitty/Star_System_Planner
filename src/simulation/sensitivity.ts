/**
 * Sensitivity Cloud Mathematics (shared by the forecast worker and unit tests).
 *
 * Generates the deterministic fan of perturbed futures for a selected body and
 * classifies each fan line's terminal regime (bound / escape / collision) so the
 * UI can surface quantitative chaos analytics instead of only drawing pretty fans.
 */

import { CelestialBody, Vector3D } from './types';
import { G_KM } from './units';

export interface SensitivityFanRequest {
  bodies: CelestialBody[];
  selectedIndex: number;
  dtSeconds: number;
  testSteps: number;
  fanCount: number;
  /** Fractional speed perturbation range, e.g. 0.015 = ±1.5%. */
  perturbFraction: number;
}

export type FanOutcome = 'bound' | 'escape' | 'collision';

export interface SensitivityFanResult {
  fans: Vector3D[][];
  outcomes: FanOutcome[];
}

/**
 * Deterministic LCG so repeat forecasts of identical states are reproducible.
 */
function makePrng(seed: number): () => number {
  let s = seed >>> 0 || 2463534242;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function computeSensitivityFans(req: SensitivityFanRequest): SensitivityFanResult {
  const { bodies, selectedIndex, dtSeconds, testSteps, fanCount, perturbFraction } = req;
  const sel = bodies[selectedIndex];
  const fans: Vector3D[][] = [];
  const outcomes: FanOutcome[] = [];
  const rand = makePrng(0x5eed ^ (selectedIndex + 1));

  const startR = Math.hypot(sel.position.x, sel.position.y, sel.position.z) || 1;

  for (let f = 0; f < fanCount; f++) {
    // Deterministic perturbations: ± perturbFraction of orbital speed plus small
    // directional tilts; rand() decorrelates fans without losing reproducibility.
    const speedDelta = 1.0 + (rand() * 2 - 1) * perturbFraction;
    const anglePitch = (rand() * 2 - 1) * perturbFraction * 0.5;
    const angleYaw = (rand() * 2 - 1) * perturbFraction * 0.5;

    const baseVx = sel.velocity.x;
    const baseVy = sel.velocity.y;
    const baseVz = sel.velocity.z;
    const baseSpeed = Math.hypot(baseVx, baseVy, baseVz);

    let pVx = baseVx * speedDelta;
    let pVy = baseVy * speedDelta + baseSpeed * anglePitch;
    let pVz = baseVz * speedDelta + baseSpeed * angleYaw;

    let curX = sel.position.x;
    let curY = sel.position.y;
    let curZ = sel.position.z;

    const fanPath: Vector3D[] = [{ x: curX, y: curY, z: curZ }];
    let outcome: FanOutcome = 'bound';

    for (let s = 0; s < testSteps; s++) {
      let ax = 0;
      let ay = 0;
      let az = 0;

      for (let j = 0; j < bodies.length; j++) {
        if (j === selectedIndex) continue;
        const dx = bodies[j].position.x - curX;
        const dy = bodies[j].position.y - curY;
        const dz = bodies[j].position.z - curZ;
        const distSq = dx * dx + dy * dy + dz * dz + 1000.0;
        const dist = Math.sqrt(distSq);
        const factor = (G_KM * bodies[j].massKg) / (distSq * dist);
        ax += dx * factor;
        ay += dy * factor;
        az += dz * factor;
      }

      pVx += ax * dtSeconds;
      pVy += ay * dtSeconds;
      pVz += az * dtSeconds;

      curX += pVx * dtSeconds;
      curY += pVy * dtSeconds;
      curZ += pVz * dtSeconds;

      // Collision detection against moving-as-static primaries
      if (outcome !== 'collision') {
        for (let j = 0; j < bodies.length; j++) {
          if (j === selectedIndex) continue;
          const dx = bodies[j].position.x - curX;
          const dy = bodies[j].position.y - curY;
          const dz = bodies[j].position.z - curZ;
          const rr = bodies[j].radiusKm + sel.radiusKm;
          if (dx * dx + dy * dy + dz * dz <= rr * rr) {
            outcome = 'collision';
            break;
          }
        }
      }

      if (s % 3 === 0 || s === testSteps - 1) {
        fanPath.push({ x: curX, y: curY, z: curZ });
      }
    }

    // Escape classification: ended far outside start radius while unbound-fast.
    if (outcome !== 'collision') {
      const endR = Math.hypot(curX, curY, curZ);
      if (endR > startR * 4) {
        outcome = 'escape';
      }
    }

    fans.push(fanPath);
    outcomes.push(outcome);
  }

  return { fans, outcomes };
}

export interface FanStatistics {
  fanCount: number;
  boundCount: number;
  escapeCount: number;
  collisionCount: number;
  /** Fraction of futures that end in a non-bound regime — the chaos index. */
  chaosIndex: number;
}

export function summarizeFanOutcomes(outcomes: FanOutcome[]): FanStatistics {
  let bound = 0;
  let escape = 0;
  let collision = 0;
  for (const o of outcomes) {
    if (o === 'bound') bound++;
    else if (o === 'escape') escape++;
    else collision++;
  }
  const total = outcomes.length || 1;
  return {
    fanCount: outcomes.length,
    boundCount: bound,
    escapeCount: escape,
    collisionCount: collision,
    chaosIndex: (escape + collision) / total,
  };
}
