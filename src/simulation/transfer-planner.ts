/**
 * Hohmann transfer planner (GAME01).
 *
 * Plans impulsive two-burn transfers between coplanar circular orbits and
 * executes the departure burn. The planner is honest about its assumption:
 * when the departure orbit is eccentric it plans from the current radius
 * and says so in the readout.
 */

import { CelestialBody } from './types';
import { G_KM } from './units';
import { calculateOsculatingElements } from './orbital-mechanics';
import { ManeuverResult, circularizeOrbit, logDeltaV } from './maneuvers';

export interface TransferPlan {
  targetRadiusKm: number;
  departureRadiusKm: number;
  dv1KmS: number;
  dv2KmS: number;
  totalDvKmS: number;
  transferTimeSec: number;
  raising: boolean;
  eccentricDeparture: boolean;
}

export function planHohmann(
  body: CelestialBody,
  primary: CelestialBody,
  targetRadiusKm: number
): TransferPlan | null {
  if (body.id === primary.id) return null;
  if (!Number.isFinite(targetRadiusKm) || targetRadiusKm <= primary.radiusKm) return null;
  const mu = G_KM * primary.massKg;
  if (!(mu > 0)) return null;

  const rx = body.position.x - primary.position.x;
  const ry = body.position.y - primary.position.y;
  const rz = body.position.z - primary.position.z;
  const r1 = Math.hypot(rx, ry, rz);
  const r2 = targetRadiusKm;
  if (!(r1 > 0) || Math.abs(r2 - r1) / r1 < 0.01) return null;

  const el = calculateOsculatingElements(body, primary);
  const eccentricDeparture = el ? el.eccentricity > 0.05 : false;

  const aT = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1);
  const vp = Math.sqrt(mu * (2 / r1 - 1 / aT));
  const va = Math.sqrt(mu * (2 / r2 - 1 / aT));
  const v2 = Math.sqrt(mu / r2);
  const dv1 = Math.abs(vp - v1);
  const dv2 = Math.abs(v2 - va);
  const transferTimeSec = Math.PI * Math.sqrt((aT * aT * aT) / mu);

  return {
    targetRadiusKm: r2,
    departureRadiusKm: r1,
    dv1KmS: dv1,
    dv2KmS: dv2,
    totalDvKmS: dv1 + dv2,
    transferTimeSec,
    raising: r2 > r1,
    eccentricDeparture,
  };
}

/**
 * Execute the departure burn: rewrite the body's planet-relative velocity
 * to the transfer-ellipse speed at the current radius, preserving the
 * prograde direction of travel.
 */
export function applyTransferDeparture(
  body: CelestialBody,
  primary: CelestialBody,
  plan: TransferPlan
): ManeuverResult {
  const mu = G_KM * primary.massKg;
  const aT = (plan.departureRadiusKm + plan.targetRadiusKm) / 2;
  const targetSpeed = Math.sqrt(mu * (2 / plan.departureRadiusKm - 1 / aT));

  const rvx = body.velocity.x - primary.velocity.x;
  const rvy = body.velocity.y - primary.velocity.y;
  const rvz = body.velocity.z - primary.velocity.z;
  const currentSpeed = Math.hypot(rvx, rvy, rvz);
  if (!(currentSpeed > 1e-9)) {
    return { applied: false, deltaVKmS: 0, detail: 'Body has no orbital motion to shape.' };
  }
  const dv = Math.abs(targetSpeed - currentSpeed);
  logDeltaV(body, dv);
  const s = targetSpeed / currentSpeed;
  body.velocity = {
    x: primary.velocity.x + rvx * s,
    y: primary.velocity.y + rvy * s,
    z: primary.velocity.z + rvz * s,
  };
  return {
    applied: true,
    deltaVKmS: dv,
    detail: `Departure burn: ${dv.toFixed(2)} km/s; circularize ${plan.raising ? 'at apoapsis' : 'at periapsis'} with ${plan.dv2KmS.toFixed(2)} km/s.`,
  };
}

/** Arrival intercept window: fraction of target radius that unlocks the burn. */
export const ARRIVAL_WINDOW_FRACTION = 0.08;

export interface ArrivalPlan {
  targetRadiusKm: number;
  currentRadiusKm: number;
  withinWindow: boolean;
  dvKmS: number;
  detail: string;
}

/**
 * Arrival burn planner (iteration 3, GAME03).
 *
 * The honest second half of a Hohmann leg: circularize at the destination.
 * The plan always reports the cost, but execution only unlocks inside the
 * intercept window so pilots cannot "arrive" from halfway across the map.
 */
export function planArrivalBurn(
  body: CelestialBody,
  primary: CelestialBody,
  targetRadiusKm: number
): ArrivalPlan | null {
  if (body.id === primary.id) return null;
  if (!Number.isFinite(targetRadiusKm) || targetRadiusKm <= primary.radiusKm) return null;
  const mu = G_KM * primary.massKg;
  if (!(mu > 0)) return null;

  const rx = body.position.x - primary.position.x;
  const ry = body.position.y - primary.position.y;
  const rz = body.position.z - primary.position.z;
  const r = Math.hypot(rx, ry, rz);
  if (!(r > 0)) return null;

  const rvx = body.velocity.x - primary.velocity.x;
  const rvy = body.velocity.y - primary.velocity.y;
  const rvz = body.velocity.z - primary.velocity.z;
  const currentSpeed = Math.hypot(rvx, rvy, rvz);
  const circularSpeed = Math.sqrt(mu / r);
  const dv = Math.abs(currentSpeed - circularSpeed);
  const withinWindow = Math.abs(r - targetRadiusKm) / targetRadiusKm <= ARRIVAL_WINDOW_FRACTION;
  return {
    targetRadiusKm,
    currentRadiusKm: r,
    withinWindow,
    dvKmS: dv,
    detail: withinWindow
      ? `Arrival window open: circularize for ${dv.toFixed(2)} km/s.`
      : 'Outside the arrival window — coast to the destination radius first.',
  };
}

/** Execute the arrival burn; rejected outside the intercept window. */
export function applyArrivalBurn(
  body: CelestialBody,
  primary: CelestialBody,
  plan: ArrivalPlan
): ManeuverResult {
  if (!plan.withinWindow) {
    return { applied: false, deltaVKmS: 0, detail: 'Outside the arrival window — coast closer first.' };
  }
  const result = circularizeOrbit(body, primary);
  if (!result.applied) return result;
  return { ...result, detail: `Arrival burn: ${result.detail}` };
}
