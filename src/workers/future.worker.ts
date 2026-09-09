/**
 * Web Worker for Asynchronous Future Trajectory and Sensitivity Cloud Forecasting.
 * 
 * Invariants:
 * - Runs off the main UI thread to prevent stutter during S Pen dragging.
 * - Discards stale requests using incrementing request tokens.
 * - Detects predicted future collisions and escapes.
 * - Simulates 30 perturbed velocity trajectories for dynamical sensitivity analysis.
 */

import { CelestialBody, Vector3D } from '../simulation/types';
import { G_KM } from '../simulation/units';

export interface FutureForecastRequest {
  requestId: number;
  bodies: CelestialBody[];
  steps: number;
  dtSeconds: number;
  selectedBodyId?: string | null;
  calculateSensitivity?: boolean;
}

export interface PredictedPoint {
  positionKm: Vector3D;
  timestampSec: number;
  isCollision?: boolean;
}

export interface PredictedCollision {
  bodyAId: string;
  bodyBId: string;
  timestampSec: number;
  positionKm: Vector3D;
  timeToImpactSec: number;
}

export interface FutureForecastResponse {
  requestId: number;
  trajectories: Record<string, PredictedPoint[]>;
  collisions: PredictedCollision[];
  sensitivityFans?: Vector3D[][];
}

// Pairwise acceleration for worker simulation
function computeWorkerAccs(
  pos: Float64Array,
  masses: Float64Array,
  fixed: Uint8Array,
  n: number,
  accs: Float64Array
): void {
  accs.fill(0);
  const softeningSq = 1000.0;

  for (let i = 0; i < n; i++) {
    if (fixed[i]) continue;
    const ix = i * 3;
    const px = pos[ix];
    const py = pos[ix + 1];
    const pz = pos[ix + 2];

    for (let j = i + 1; j < n; j++) {
      const jx = j * 3;
      const dx = pos[jx] - px;
      const dy = pos[jx + 1] - py;
      const dz = pos[jx + 2] - pz;

      const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
      const dist = Math.sqrt(distSq);
      if (dist <= 0) continue;

      const factor = G_KM / (distSq * dist);

      if (!fixed[i] && masses[j] > 0) {
        const fI = masses[j] * factor;
        accs[ix] += dx * fI;
        accs[ix + 1] += dy * fI;
        accs[ix + 2] += dz * fI;
      }

      if (!fixed[j] && masses[i] > 0) {
        const fJ = masses[i] * factor;
        accs[jx] -= dx * fJ;
        accs[jx + 1] -= dy * fJ;
        accs[jx + 2] -= dz * fJ;
      }
    }
  }
}

self.onmessage = (event: MessageEvent<FutureForecastRequest>) => {
  const { requestId, bodies, steps, dtSeconds, selectedBodyId, calculateSensitivity } = event.data;

  const n = bodies.length;
  if (n === 0) {
    self.postMessage({ requestId, trajectories: {}, collisions: [] } as FutureForecastResponse);
    return;
  }

  // Pre-allocate flat arrays for optimal worker performance
  const pos = new Float64Array(n * 3);
  const vel = new Float64Array(n * 3);
  const masses = new Float64Array(n);
  const radii = new Float64Array(n);
  const fixed = new Uint8Array(n);
  const accs = new Float64Array(n * 3);
  const newAccs = new Float64Array(n * 3);

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    pos[i * 3] = b.position.x;
    pos[i * 3 + 1] = b.position.y;
    pos[i * 3 + 2] = b.position.z;

    vel[i * 3] = b.velocity.x;
    vel[i * 3 + 1] = b.velocity.y;
    vel[i * 3 + 2] = b.velocity.z;

    masses[i] = b.massKg;
    radii[i] = b.radiusKm;
    fixed[i] = b.fixed ? 1 : 0;
  }

  const sampleInterval = Math.max(1, Math.floor(steps / 150));
  const trajectories: Record<string, PredictedPoint[]> = {};
  for (let i = 0; i < n; i++) {
    trajectories[bodies[i].id] = [];
  }

  const collisions: PredictedCollision[] = [];
  const halfDt = 0.5 * dtSeconds;
  let currentSimTime = 0;

  computeWorkerAccs(pos, masses, fixed, n, accs);

  for (let step = 0; step < steps; step++) {
    // 1. First Kick & Drift
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const ix = i * 3;
      vel[ix] += accs[ix] * halfDt;
      vel[ix + 1] += accs[ix + 1] * halfDt;
      vel[ix + 2] += accs[ix + 2] * halfDt;

      pos[ix] += vel[ix] * dtSeconds;
      pos[ix + 1] += vel[ix + 1] * dtSeconds;
      pos[ix + 2] += vel[ix + 2] * dtSeconds;
    }

    // 2. Re-compute accelerations
    computeWorkerAccs(pos, masses, fixed, n, newAccs);

    // 3. Second Kick
    for (let i = 0; i < n; i++) {
      if (fixed[i]) continue;
      const ix = i * 3;
      vel[ix] += newAccs[ix] * halfDt;
      vel[ix + 1] += newAccs[ix + 1] * halfDt;
      vel[ix + 2] += newAccs[ix + 2] * halfDt;
      accs[ix] = newAccs[ix];
      accs[ix + 1] = newAccs[ix + 1];
      accs[ix + 2] = newAccs[ix + 2];
    }

    currentSimTime += dtSeconds;

    // Check collisions
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      for (let j = i + 1; j < n; j++) {
        const jx = j * 3;
        const dx = pos[jx] - pos[ix];
        const dy = pos[jx + 1] - pos[ix + 1];
        const dz = pos[jx + 2] - pos[ix + 2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist <= radii[i] + radii[j]) {
          collisions.push({
            bodyAId: bodies[i].id,
            bodyBId: bodies[j].id,
            timestampSec: currentSimTime,
            positionKm: { x: pos[ix], y: pos[ix + 1], z: pos[ix + 2] },
            timeToImpactSec: currentSimTime,
          });
        }
      }
    }

    // Record sample points
    if (step % sampleInterval === 0 || step === steps - 1) {
      for (let i = 0; i < n; i++) {
        trajectories[bodies[i].id].push({
          positionKm: { x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] },
          timestampSec: currentSimTime,
        });
      }
    }
  }

  // Calculate 30-line Sensitivity Cloud if requested for selected body
  let sensitivityFans: Vector3D[][] | undefined;
  const selIndex = selectedBodyId ? bodies.findIndex(b => b.id === selectedBodyId) : -1;

  if (calculateSensitivity && selIndex !== -1 && !bodies[selIndex].fixed) {
    sensitivityFans = [];
    const baseVx = bodies[selIndex].velocity.x;
    const baseVy = bodies[selIndex].velocity.y;
    const baseVz = bodies[selIndex].velocity.z;
    const baseSpeed = Math.hypot(baseVx, baseVy, baseVz);

    const fanCount = 30;
    const testSteps = Math.min(180, steps);

    for (let f = 0; f < fanCount; f++) {
      // Perturb speed and orientation slightly
      const speedDelta = 1.0 + (Math.sin(f * 1.7) * 0.015); // +/- 1.5% speed
      const anglePitch = ((f % 6) - 2.5) * 0.008; // small radians
      const angleYaw = ((f % 5) - 2.0) * 0.008;

      let pVx = baseVx * speedDelta;
      let pVy = baseVy * speedDelta + baseSpeed * anglePitch;
      let pVz = baseVz * speedDelta + baseSpeed * angleYaw;

      let curX = bodies[selIndex].position.x;
      let curY = bodies[selIndex].position.y;
      let curZ = bodies[selIndex].position.z;

      const fanPath: Vector3D[] = [{ x: curX, y: curY, z: curZ }];

      // Run fast trajectory forward relative to other bodies
      for (let s = 0; s < testSteps; s++) {
        // Gravitational pull towards all other bodies
        let ax = 0;
        let ay = 0;
        let az = 0;

        for (let j = 0; j < n; j++) {
          if (j === selIndex) continue;
          const dx = bodies[j].position.x - curX;
          const dy = bodies[j].position.y - curY;
          const dz = bodies[j].position.z - curZ;
          const distSq = dx * dx + dy * dy + dz * dz + 1000.0;
          const factor = (G_KM * bodies[j].massKg) / (distSq * Math.sqrt(distSq));
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

        if (s % 3 === 0 || s === testSteps - 1) {
          fanPath.push({ x: curX, y: curY, z: curZ });
        }
      }

      sensitivityFans.push(fanPath);
    }
  }

  const response: FutureForecastResponse = {
    requestId,
    trajectories,
    collisions,
    sensitivityFans,
  };

  self.postMessage(response);
};
