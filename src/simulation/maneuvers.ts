/**
 * Flight-dynamics maneuver helpers (GAME10 delta-v nudges, GAME11 orbit
 * circularization, GAME12 rendezvous matching).
 *
 * All maneuvers operate in the inertial frame and report the applied
 * delta-v so the ledger and challenge systems can credit pilot actions.
 */

import { CelestialBody, Vector3D } from './types';
import { G_KM } from './units';
import { calculateOsculatingElements } from './orbital-mechanics';

export interface ManeuverResult {
  applied: boolean;
  deltaVKmS: number;
  detail: string;
}

function magnitude(v: Vector3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vector3D): Vector3D {
  const m = magnitude(v) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function relativeState(body: CelestialBody, primary: CelestialBody): { r: Vector3D; v: Vector3D } {
  return {
    r: {
      x: body.position.x - primary.position.x,
      y: body.position.y - primary.position.y,
      z: body.position.z - primary.position.z,
    },
    v: {
      x: body.velocity.x - primary.velocity.x,
      y: body.velocity.y - primary.velocity.y,
      z: body.velocity.z - primary.velocity.z,
    },
  };
}

export type NudgeDirection = 'prograde' | 'retrograde' | 'radial-out' | 'radial-in' | 'normal' | 'anti-normal';

/** GAME10 — apply a small impulsive burn along an orbital direction. */
export function applyNudge(body: CelestialBody, primary: CelestialBody, direction: NudgeDirection, dvKmS: number): ManeuverResult {
  const { r, v } = relativeState(body, primary);
  const speed = magnitude(v);
  if (speed < 1e-9) {
    return { applied: false, deltaVKmS: 0, detail: 'Body is stationary relative to primary; nudge undefined.' };
  }
  const prograde = normalize(v);
  const radial = normalize(r);
  // Orbit normal = r × v.
  const normal = normalize({
    x: r.y * v.z - r.z * v.y,
    y: r.z * v.x - r.x * v.z,
    z: r.x * v.y - r.y * v.x,
  });
  const axes: Record<NudgeDirection, Vector3D> = {
    prograde,
    retrograde: { x: -prograde.x, y: -prograde.y, z: -prograde.z },
    'radial-out': radial,
    'radial-in': { x: -radial.x, y: -radial.y, z: -radial.z },
    normal,
    'anti-normal': { x: -normal.x, y: -normal.y, z: -normal.z },
  };
  const axis = axes[direction];
  body.velocity = {
    x: body.velocity.x + axis.x * dvKmS,
    y: body.velocity.y + axis.y * dvKmS,
    z: body.velocity.z + axis.z * dvKmS,
  };
  return { applied: true, deltaVKmS: dvKmS, detail: `${direction} burn of ${dvKmS.toFixed(2)} km/s` };
}

/** GAME11 — rewrite velocity for a circular orbit at the current radius. */
export function circularizeOrbit(body: CelestialBody, primary: CelestialBody): ManeuverResult {
  const mu = G_KM * primary.massKg;
  const { r, v } = relativeState(body, primary);
  const radius = magnitude(r);
  if (radius < 1 || mu <= 0) {
    return { applied: false, deltaVKmS: 0, detail: 'Circularization undefined for this configuration.' };
  }
  const circularSpeed = Math.sqrt(mu / radius);
  // Preserve the current orbital plane: v_circ ⟂ r within the (r, v) plane.
  const rHat = normalize(r);
  const h = { x: r.y * v.z - r.z * v.y, y: r.z * v.x - r.x * v.z, z: r.x * v.y - r.y * v.x };
  const hMag = magnitude(h);
  if (hMag < 1e-9) {
    return { applied: false, deltaVKmS: 0, detail: 'Radial trajectory has no defined orbital plane.' };
  }
  const hHat = normalize(h);
  // v_dir = h × r direction of motion.
  const vDir = normalize({
    x: hHat.y * rHat.z - hHat.z * rHat.y,
    y: hHat.z * rHat.x - hHat.x * rHat.z,
    z: hHat.x * rHat.y - hHat.y * rHat.x,
  });
  const newRelV = { x: vDir.x * circularSpeed, y: vDir.y * circularSpeed, z: vDir.z * circularSpeed };
  const dv = Math.hypot(newRelV.x - v.x, newRelV.y - v.y, newRelV.z - v.z);
  body.velocity = {
    x: primary.velocity.x + newRelV.x,
    y: primary.velocity.y + newRelV.y,
    z: primary.velocity.z + newRelV.z,
  };
  return { applied: true, deltaVKmS: dv, detail: `Circularized at ${(radius / 149597870.7).toFixed(3)} AU (Δv ${dv.toFixed(2)} km/s)` };
}

/** GAME12 — match the inertial velocity of a rendezvous target. */
export function matchVelocity(body: CelestialBody, target: CelestialBody): ManeuverResult {
  if (body.id === target.id) {
    return { applied: false, deltaVKmS: 0, detail: 'Cannot rendezvous with itself.' };
  }
  const dv = Math.hypot(
    target.velocity.x - body.velocity.x,
    target.velocity.y - body.velocity.y,
    target.velocity.z - body.velocity.z
  );
  body.velocity = { ...target.velocity };
  return { applied: true, deltaVKmS: dv, detail: `Matched velocity with ${target.name} (Δv ${dv.toFixed(2)} km/s)` };
}

/** Escape-speed margin at the body's current separation (positive = bound headroom). */
export function escapeMarginKmS(body: CelestialBody, primary: CelestialBody): number | null {
  const elements = calculateOsculatingElements(body, primary);
  if (!elements) return null;
  const mu = G_KM * primary.massKg;
  const r = Math.hypot(
    body.position.x - primary.position.x,
    body.position.y - primary.position.y,
    body.position.z - primary.position.z
  );
  if (r <= 0 || mu <= 0) return null;
  const vEsc = Math.sqrt((2 * mu) / r);
  const speed = Math.hypot(
    body.velocity.x - primary.velocity.x,
    body.velocity.y - primary.velocity.y,
    body.velocity.z - primary.velocity.z
  );
  return vEsc - speed;
}
