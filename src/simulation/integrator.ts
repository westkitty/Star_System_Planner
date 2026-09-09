/**
 * Symplectic Velocity Verlet Integrator for N-body Pairwise Gravity.
 * 
 * Kick-Drift-Kick formulation:
 * 1. v(t + dt/2) = v(t) + a(t) * (dt / 2)
 * 2. x(t + dt)   = x(t) + v(t + dt/2) * dt
 * 3. compute a(t + dt) from x(t + dt)
 * 4. v(t + dt)   = v(t + dt/2) + a(t + dt) * (dt / 2)
 * 
 * Invariants:
 * - Symplectic: Conserves phase-space volume and bounds energy drift over long integrations.
 * - Softened: Prevents division by zero when bodies approach within collocated distance.
 * - Guarded: Validates for NaN and Infinity on every acceleration step.
 */

import { CelestialBody } from './types';
import { G_KM } from './units';

// Softening distance squared in km^2 to prevent gravitational singularities
const SOFTENING_SQ_KM = 1000.0; // 1000 km^2 softening

export interface AccelerationVector {
  ax: number;
  ay: number;
  az: number;
}

/**
 * Compute gravitational acceleration on each body from all other bodies.
 */
export function computeAccelerations(bodies: CelestialBody[]): AccelerationVector[] {
  const n = bodies.length;
  const accs: AccelerationVector[] = new Array(n);
  for (let i = 0; i < n; i++) {
    accs[i] = { ax: 0, ay: 0, az: 0 };
  }

  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    if (bi.fixed) continue;

    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];

      const dx = bj.position.x - bi.position.x;
      const dy = bj.position.y - bi.position.y;
      const dz = bj.position.z - bi.position.z;

      const distSq = dx * dx + dy * dy + dz * dz + SOFTENING_SQ_KM;
      const dist = Math.sqrt(distSq);

      if (dist <= 0 || !Number.isFinite(dist)) continue;

      // Force magnitude F / (m_i * m_j) = G / dist^2
      // Acceleration a_i = G * m_j / dist^2 * (dir)
      const invDistCube = 1.0 / (distSq * dist);
      const gTerm = G_KM * invDistCube;

      if (!bi.fixed && bj.massKg > 0) {
        const factorI = bj.massKg * gTerm;
        accs[i].ax += dx * factorI;
        accs[i].ay += dy * factorI;
        accs[i].az += dz * factorI;
      }

      if (!bj.fixed && bi.massKg > 0) {
        const factorJ = bi.massKg * gTerm;
        accs[j].ax -= dx * factorJ;
        accs[j].ay -= dy * factorJ;
        accs[j].az -= dz * factorJ;
      }
    }
  }

  return accs;
}

/**
 * Perform a single Velocity Verlet integration sub-step of length dtSeconds.
 * Returns true if successful, false if NaN/Infinity was detected.
 */
export function stepVelocityVerlet(bodies: CelestialBody[], dtSeconds: number): boolean {
  if (dtSeconds <= 0 || !Number.isFinite(dtSeconds)) return false;

  const n = bodies.length;
  const halfDt = 0.5 * dtSeconds;

  // 1. First Kick: calculate initial accelerations and advance velocity by half dt
  const initialAccs = computeAccelerations(bodies);

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.fixed) continue;

    const ax = initialAccs[i].ax;
    const ay = initialAccs[i].ay;
    const az = initialAccs[i].az;

    b.velocity.x += ax * halfDt;
    b.velocity.y += ay * halfDt;
    b.velocity.z += az * halfDt;

    // 2. Drift: advance position by full dt using the half-step velocity
    b.position.x += b.velocity.x * dtSeconds;
    b.position.y += b.velocity.y * dtSeconds;
    b.position.z += b.velocity.z * dtSeconds;

    if (
      !Number.isFinite(b.position.x) ||
      !Number.isFinite(b.position.y) ||
      !Number.isFinite(b.position.z) ||
      !Number.isFinite(b.velocity.x) ||
      !Number.isFinite(b.velocity.y) ||
      !Number.isFinite(b.velocity.z)
    ) {
      return false; // NaN or Infinity guard
    }
  }

  // 3. Re-evaluate accelerations at new positions
  const newAccs = computeAccelerations(bodies);

  // 4. Second Kick: advance velocity by remaining half dt
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.fixed) continue;

    const ax = newAccs[i].ax;
    const ay = newAccs[i].ay;
    const az = newAccs[i].az;

    b.velocity.x += ax * halfDt;
    b.velocity.y += ay * halfDt;
    b.velocity.z += az * halfDt;

    if (
      !Number.isFinite(b.velocity.x) ||
      !Number.isFinite(b.velocity.y) ||
      !Number.isFinite(b.velocity.z)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate total mechanical energy of the system (Kinetic + Potential).
 * Used for stability and energy drift verification.
 */
export function calculateSystemEnergy(bodies: CelestialBody[]): { kinetic: number; potential: number; total: number } {
  let kinetic = 0;
  let potential = 0;
  const n = bodies.length;

  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    const vSq = bi.velocity.x ** 2 + bi.velocity.y ** 2 + bi.velocity.z ** 2;
    kinetic += 0.5 * bi.massKg * vSq;

    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.position.x - bi.position.x;
      const dy = bj.position.y - bi.position.y;
      const dz = bj.position.z - bi.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 0) {
        potential -= (G_KM * bi.massKg * bj.massKg) / dist;
      }
    }
  }

  return { kinetic, potential, total: kinetic + potential };
}
