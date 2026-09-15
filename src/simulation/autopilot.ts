/**
 * Simplified Two-Impulse Transfer Autopilot.
 *
 * Computes a Hohmann-style co-planar transfer between two circular radii around a
 * shared primary, injects the departure burn immediately, then circularizes when
 * the craft reaches the insertion radius (detected as a crossing of the insertion
 * band during engine updates).
 *
 * Honesty boundary: this is a planner-grade impulse approximation, not a full
 * Lambert solver. It assumes near-circular initial and target orbits around the
 * same dominant primary.
 */

import { CelestialBody, Vector3D } from './types';
import { G_KM } from './units';

export interface AutopilotProgram {
  shipId: string;
  targetId: string;
  primaryId: string;
  insertionRadiusKm: number;
  stage: 'transfer' | 'coast' | 'done';
  /** True when insertion radius is larger than departure radius (transferring outward). */
  outbound: boolean;
}

export interface TransferPlan {
  departDeltaVKmS: number;
  transferTimeSec: number;
  insertionRadiusKm: number;
}

function distanceTo(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Plan a two-impulse transfer of `ship` from its current radius to the target's
 * orbital radius around `primary`.
 */
export function planTransfer(
  ship: CelestialBody,
  target: CelestialBody,
  primary: CelestialBody
): TransferPlan | null {
  const r1 = distanceTo(ship.position, primary.position);
  const r2 = distanceTo(target.position, primary.position);
  const mu = G_KM * primary.massKg;
  if (r1 <= 0 || r2 <= 0 || mu <= 0) return null;
  if (Math.abs(r2 - r1) / Math.max(r1, r2) < 0.01) return null; // Already co-orbital.

  const aT = (r1 + r2) / 2.0;
  const transferTimeSec = Math.PI * Math.sqrt((aT ** 3) / mu);

  // Departure: speed needed at r1 on the transfer ellipse compared with current
  // tangential speed.
  const relV: Vector3D = {
    x: ship.velocity.x - primary.velocity.x,
    y: ship.velocity.y - primary.velocity.y,
    z: ship.velocity.z - primary.velocity.z,
  };
  const vCurrent = Math.hypot(relV.x, relV.y, relV.z);
  const vRequired = Math.sqrt(mu * (2.0 / r1 - 1.0 / aT));
  const departDeltaVKmS = vRequired - vCurrent;

  return {
    departDeltaVKmS,
    transferTimeSec,
    insertionRadiusKm: r2,
  };
}

/**
 * Apply the departure burn to the ship's velocity along its current tangential
 * direction of motion (prograde for positive delta-v, retrograde for negative).
 */
export function executeDepartureBurn(ship: CelestialBody, primary: CelestialBody, deltaVKmS: number): void {
  const relV: Vector3D = {
    x: ship.velocity.x - primary.velocity.x,
    y: ship.velocity.y - primary.velocity.y,
    z: ship.velocity.z - primary.velocity.z,
  };
  const speed = Math.hypot(relV.x, relV.y, relV.z);
  if (speed <= 1e-6) return;

  const ux = relV.x / speed;
  const uy = relV.y / speed;
  const uz = relV.z / speed;

  ship.velocity.x += ux * deltaVKmS;
  ship.velocity.y += uy * deltaVKmS;
  ship.velocity.z += uz * deltaVKmS;
}

/**
 * Circularize the ship's orbit at its current radius (velocity snapped to the
 * local circular speed, preserving the direction of motion in the primary frame).
 */
export function circularizeAtCurrentRadius(ship: CelestialBody, primary: CelestialBody): void {
  const r = distanceTo(ship.position, primary.position);
  const mu = G_KM * primary.massKg;
  if (r <= 0 || mu <= 0) return;

  const relV: Vector3D = {
    x: ship.velocity.x - primary.velocity.x,
    y: ship.velocity.y - primary.velocity.y,
    z: ship.velocity.z - primary.velocity.z,
  };
  const speed = Math.hypot(relV.x, relV.y, relV.z);
  if (speed <= 1e-6) return;

  const vCirc = Math.sqrt(mu / r);
  const scale = vCirc / speed;
  ship.velocity.x = primary.velocity.x + relV.x * scale;
  ship.velocity.y = primary.velocity.y + relV.y * scale;
  ship.velocity.z = primary.velocity.z + relV.z * scale;
}

/**
 * Advance an active autopilot program by one engine frame. Mutates the ship when
 * the insertion radius band is crossed. Returns true while a program remains active,
 * false when it has completed and should be cleared.
 */
export function advanceAutopilot(
  program: AutopilotProgram,
  ship: CelestialBody,
  primary: CelestialBody,
  toleranceFraction: number
): boolean {
  if (program.stage !== 'transfer') return program.stage !== 'done';

  const r = distanceTo(ship.position, primary.position);
  const band = program.insertionRadiusKm * toleranceFraction;
  const reached = program.outbound
    ? r >= program.insertionRadiusKm - band
    : r <= program.insertionRadiusKm + band;

  if (reached) {
    circularizeAtCurrentRadius(ship, primary);
    program.stage = 'done';
    return false;
  }
  return true;
}
