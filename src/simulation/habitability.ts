/**
 * Habitability assessment (GAME08).
 *
 * A composite 0–100 score from surface temperature, orbital eccentricity,
 * stellar temperament, tidal state, and lunar companionship. Scores feed
 * the inspector verdict, the Harbor Light contract, and steward-style
 * progression — thermal regimes alone never told the whole story.
 */

import { CelestialBody } from './types';
import { SOLAR_MASS_KG } from './units';
import { calculateOsculatingElements, findDominantPrimary } from './orbital-mechanics';
import { estimateTidalLock } from './tidal-locking';

export type HabitabilityVerdict = 'paradise' | 'promising' | 'marginal' | 'hostile' | 'dead';

export interface HabitabilityFactor {
  label: string;
  points: number;
  max: number;
}

export interface HabitabilityReport {
  score: number;
  verdict: HabitabilityVerdict;
  factors: HabitabilityFactor[];
}

function stellarTemperament(primary: CelestialBody | null): { points: number; label: string } {
  if (!primary || primary.type !== 'star') return { points: 8, label: 'No stable star' };
  const m = primary.massKg / SOLAR_MASS_KG;
  if (m >= 0.8 && m <= 1.2) return { points: 20, label: 'G-class steady' };
  if (m >= 0.45 && m < 0.8) return { points: 20, label: 'K-class calm' };
  if (m > 1.2 && m <= 1.6) return { points: 16, label: 'F-class bright' };
  if (m < 0.45) return { points: 10, label: 'M-class flare risk' };
  return { points: 6, label: 'Hot short-lived star' };
}

export function verdictForScore(score: number): HabitabilityVerdict {
  if (score >= 80) return 'paradise';
  if (score >= 60) return 'promising';
  if (score >= 40) return 'marginal';
  if (score >= 20) return 'hostile';
  return 'dead';
}

export function assessHabitability(body: CelestialBody, allBodies: CelestialBody[]): HabitabilityReport | null {
  if (body.type !== 'planet' && body.type !== 'moon' && body.type !== 'dwarf_planet') return null;
  const primary = body.primaryId
    ? (allBodies.find((b) => b.id === body.primaryId) ?? findDominantPrimary(body, allBodies))
    : findDominantPrimary(body, allBodies);

  const tempK = body.temperatureK ?? 0;
  const tempPoints = tempK > 0 ? Math.round(40 * Math.exp(-Math.pow((tempK - 288) / 95, 2))) : 0;

  const el = primary ? calculateOsculatingElements(body, primary) : null;
  const ecc = el ? el.eccentricity : 0.5;
  const eccPoints = Math.round(20 * (1 - Math.min(1, Math.max(0, ecc) * 2.5)));

  const stellar = stellarTemperament(primary);

  const tidal = primary ? estimateTidalLock(body, primary) : null;
  const tidalPoints = !tidal ? 5 : tidal.isLocked ? 3 : 10;

  const hasMoon = allBodies.some((b) => b.primaryId === body.id);
  const moonPoints = hasMoon ? 10 : 6;

  const factors: HabitabilityFactor[] = [
    { label: tempK > 0 ? `Surface ${Math.round(tempK)} K` : 'No thermal data', points: tempPoints, max: 40 },
    { label: `Eccentricity ${ecc.toFixed(2)}`, points: eccPoints, max: 20 },
    { label: stellar.label, points: stellar.points, max: 20 },
    {
      label: !tidal ? 'Tidal state unknown' : tidal.isLocked ? 'Tidally locked' : 'Free rotation',
      points: tidalPoints,
      max: 10,
    },
    { label: hasMoon ? 'Lunar companion' : 'Moonless', points: moonPoints, max: 10 },
  ];
  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, verdict: verdictForScore(score), factors };
}
