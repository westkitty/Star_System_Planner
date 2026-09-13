/**
 * System-wide statistics and stability scoring (supports GAME15 dashboard).
 */

import { CelestialBody } from './types';
import { G_KM, KM_PER_AU } from './units';
import { calculateOsculatingElements, findDominantPrimary } from './orbital-mechanics';

export interface SystemStatistics {
  bodyCount: number;
  starCount: number;
  planetCount: number;
  moonCount: number;
  stationCount: number;
  blackHoleCount: number;
  ringCount: number;
  totalMassKg: number;
  totalKineticEnergyJ: number;
  totalPotentialEnergyJ: number;
  totalEnergyJ: number;
  angularMomentumKgKm2S: number;
  boundCount: number;
  unboundCount: number;
  temperateCount: number;
  /** 0..100 heuristic: bound fraction, stability margins, diversity. */
  stabilityScore: number;
  widestOrbitAu: number;
}

export function computeSystemStatistics(bodies: CelestialBody[]): SystemStatistics {
  let ke = 0;
  let pe = 0;
  let angMom = 0;
  let totalMass = 0;
  let ringCount = 0;
  let temperateCount = 0;
  let boundCount = 0;
  let unboundCount = 0;
  let widestOrbitKm = 0;

  const counts = { star: 0, planet: 0, moon: 0, station: 0, blackHole: 0 };

  for (const b of bodies) {
    totalMass += b.massKg;
    const speedKmS = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
    ke += 0.5 * b.massKg * Math.pow(speedKmS * 1000, 2);
    // |L| about origin: |r × mv|.
    const rx = b.position.x * 1000;
    const ry = b.position.y * 1000;
    const rz = b.position.z * 1000;
    const vx = b.velocity.x * 1000;
    const vy = b.velocity.y * 1000;
    const vz = b.velocity.z * 1000;
    const lx = ry * vz - rz * vy;
    const ly = rz * vx - rx * vz;
    const lz = rx * vy - ry * vx;
    angMom += b.massKg * Math.hypot(lx, ly, lz);

    ringCount += b.rings?.length ?? 0;
    const temp = b.temperatureK ?? 0;
    if (b.type === 'planet' || b.type === 'moon') {
      if (temp >= 200 && temp <= 320) temperateCount++;
    }
    if (b.type === 'star') counts.star++;
    else if (b.type === 'planet' || b.type === 'dwarf_planet') counts.planet++;
    else if (b.type === 'moon') counts.moon++;
    else if (b.type === 'station' || b.type === 'ship') counts.station++;
    else if (b.type === 'black_hole') counts.blackHole++;

    const primary = findDominantPrimary(b, bodies);
    if (primary) {
      const elements = calculateOsculatingElements(b, primary);
      if (elements) {
        if (elements.isBound) boundCount++;
        else unboundCount++;
        if (elements.isBound) widestOrbitKm = Math.max(widestOrbitKm, elements.apoapsisKm);
      }
    }
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const c = bodies[j];
      const distKm = Math.max(
        1,
        Math.hypot(a.position.x - c.position.x, a.position.y - c.position.y, a.position.z - c.position.z)
      );
      pe += (-G_KM * a.massKg * c.massKg) / distKm; // km^2/s^2·kg → ×1e6 for joules
    }
  }
  pe *= 1e6;

  const orbiters = boundCount + unboundCount;
  const boundFraction = orbiters > 0 ? boundCount / orbiters : 1;
  const diversity = Math.min(1, (counts.planet + counts.moon + counts.station) / 6);
  const catastrophePenalty = unboundCount > 0 ? Math.min(0.4, unboundCount * 0.1) : 0;
  const stabilityScore = Math.round(
    Math.max(0, Math.min(100, (boundFraction * 0.7 + diversity * 0.3 - catastrophePenalty) * 100))
  );

  return {
    bodyCount: bodies.length,
    starCount: counts.star,
    planetCount: counts.planet,
    moonCount: counts.moon,
    stationCount: counts.station,
    blackHoleCount: counts.blackHole,
    ringCount,
    totalMassKg: totalMass,
    totalKineticEnergyJ: ke,
    totalPotentialEnergyJ: pe,
    totalEnergyJ: ke + pe,
    angularMomentumKgKm2S: angMom,
    boundCount,
    unboundCount,
    temperateCount,
    stabilityScore,
    widestOrbitAu: widestOrbitKm / KM_PER_AU,
  };
}
