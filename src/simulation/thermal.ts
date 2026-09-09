/**
 * Simplified Planetary Thermal and Habitable Zone Indicators.
 * 
 * Invariants:
 * - Does not claim to simulate dynamic global climate.
 * - Surfaces defensible simplified indicators: flux, equilibrium temperature,
 *   albedo, greenhouse offset, and habitable zone bounds.
 */

import { CelestialBody } from './types';
import { KM_PER_AU, SOLAR_LUMINOSITY_W, STEFAN_BOLTZMANN } from './units';

export interface ThermalState {
  incidentFluxWm2: number;
  equilibriumTempK: number;
  surfaceTempK: number;
  albedo: number;
  greenhouseOffsetK: number;
  inHabitableZone: boolean;
}

export interface HabitableZoneBounds {
  starId: string;
  innerRadiusKm: number;
  outerRadiusKm: number;
}

/**
 * Calculate habitable zone bounds for a luminous star.
 * Conservative estimate: inner ~ 0.95 AU * sqrt(L/L_sun), outer ~ 1.40 AU * sqrt(L/L_sun)
 */
export function calculateHabitableZone(star: CelestialBody): HabitableZoneBounds | null {
  if (star.type !== 'star' || !star.luminosityW || star.luminosityW <= 0) {
    return null;
  }

  const relLum = star.luminosityW / SOLAR_LUMINOSITY_W;
  const sqrtL = Math.sqrt(relLum);

  return {
    starId: star.id,
    innerRadiusKm: 0.95 * KM_PER_AU * sqrtL,
    outerRadiusKm: 1.40 * KM_PER_AU * sqrtL,
  };
}

/**
 * Calculate equilibrium thermal state for a celestial body relative to all luminous stars.
 */
export function updateBodyTemperatures(bodies: CelestialBody[]): void {
  const stars = bodies.filter(b => b.type === 'star' && (b.luminosityW ?? 0) > 0);

  for (const b of bodies) {
    if (b.type === 'star') {
      // Star surface temperature approximation if not set
      if (!b.temperatureK) {
        // T = (L / (4 * pi * R^2 * sigma))^(1/4)
        const rMeters = b.radiusKm * 1000;
        const area = 4 * Math.PI * rMeters * rMeters;
        if (b.luminosityW && area > 0) {
          b.temperatureK = Math.round(Math.pow(b.luminosityW / (area * STEFAN_BOLTZMANN), 0.25));
        } else {
          b.temperatureK = 5778; // G-type default
        }
      }
      continue;
    }

    if (b.type === 'black_hole') {
      b.temperatureK = 3; // Cosmic background void
      continue;
    }

    let totalFluxWm2 = 0;
    const albedo = b.albedo ?? 0.3;
    const greenhouse = b.greenhouseOffsetK ?? 0;

    for (const star of stars) {
      const dx = (b.position.x - star.position.x) * 1000; // meters
      const dy = (b.position.y - star.position.y) * 1000;
      const dz = (b.position.z - star.position.z) * 1000;
      const distMeters = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distMeters > 0 && star.luminosityW) {
        const flux = star.luminosityW / (4 * Math.PI * distMeters * distMeters);
        totalFluxWm2 += flux;
      }
    }

    if (totalFluxWm2 > 0) {
      // T_eq = (Flux * (1 - A) / (4 * sigma))^(1/4)
      const tEq = Math.pow((totalFluxWm2 * (1.0 - albedo)) / (4.0 * STEFAN_BOLTZMANN), 0.25);
      b.temperatureK = Math.round(tEq + greenhouse);
    } else {
      b.temperatureK = 3; // Deep void temperature
    }
  }
}
