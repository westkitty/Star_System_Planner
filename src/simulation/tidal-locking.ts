/**
 * Tidal-locking timescale estimate (GAME09).
 *
 * A documented first-order approximation (a^6 sensitivity dominates, as in
 * the classic Peale/Goldreich scaling): worlds deep in the gravity well
 * lock fast, distant worlds keep their days. Anything locking within a
 * gigayear reads as tidally locked for gameplay purposes.
 */

import { CelestialBody } from './types';
import { EARTH_MASS_KG, KM_PER_AU, SOLAR_MASS_KG } from './units';

export interface TidalLockEstimate {
  /** Years until synchronous rotation (order-of-magnitude). */
  yearsToLock: number;
  isLocked: boolean;
}

const LOCK_THRESHOLD_YEARS = 1e9;
// Calibrated so Earth ≈ 1.5e10 yr (free) and Mercury-analogs lock.
const CALIBRATION_YEARS = 1.5e10;

export function estimateTidalLock(body: CelestialBody, primary: CelestialBody): TidalLockEstimate | null {
  if (body.id === primary.id) return null;
  const distKm = Math.hypot(
    body.position.x - primary.position.x,
    body.position.y - primary.position.y,
    body.position.z - primary.position.z
  );
  if (!(distKm > 0) || !(primary.massKg > 0) || !(body.massKg > 0) || !(body.radiusKm > 0)) {
    return null;
  }
  const aAu = distKm / KM_PER_AU;
  const mStar = primary.massKg / SOLAR_MASS_KG;
  const mBody = body.massKg / EARTH_MASS_KG;
  const rBody = body.radiusKm / 6371;
  const yearsToLock =
    CALIBRATION_YEARS * Math.pow(aAu, 6) * Math.pow(mStar, -2) * mBody * Math.pow(rBody, -3);
  return {
    yearsToLock,
    isLocked: yearsToLock < LOCK_THRESHOLD_YEARS,
  };
}

export function formatLockTimescale(years: number): string {
  if (!Number.isFinite(years)) return 'unknown';
  if (years >= 1e9) return `${(years / 1e9).toFixed(1)} Gyr`;
  if (years >= 1e6) return `${(years / 1e6).toFixed(1)} Myr`;
  if (years >= 1e3) return `${(years / 1e3).toFixed(1)} kyr`;
  return `${Math.max(1, Math.round(years))} yr`;
}
