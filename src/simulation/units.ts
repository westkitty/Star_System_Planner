/**
 * Simulation Unit Definitions and Physical Constants.
 * 
 * Internal convention:
 * - Distance: Kilometers (km)
 * - Time: Seconds (s)
 * - Mass: Kilograms (kg)
 * - Velocity: km/s
 * 
 * Gravitational constant G in (km^3 / (kg * s^2)):
 * Standard G = 6.67430e-11 m^3 / (kg * s^2)
 * In km: G = 6.67430e-20 km^3 / (kg * s^2)
 */

export const G_KM = 6.67430e-20; // km^3 / (kg * s^2)

// Astronomical reference constants
export const KM_PER_AU = 149597870.7; // km
export const SOLAR_MASS_KG = 1.98847e30; // kg
export const SOLAR_RADIUS_KM = 696340; // km
export const SOLAR_LUMINOSITY_W = 3.828e26; // Watts
export const EARTH_MASS_KG = 5.9722e24; // kg
export const EARTH_RADIUS_KM = 6371; // km
export const MOON_MASS_KG = 7.342e22; // kg
export const MOON_RADIUS_KM = 1737.4; // km
export const JUPITER_MASS_KG = 1.8982e27; // kg
export const JUPITER_RADIUS_KM = 69911; // km

// Stefan-Boltzmann constant: 5.670374e-8 W / (m^2 * K^4)
export const STEFAN_BOLTZMANN = 5.670374419e-8;

// Time helpers
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;

/**
 * Format distance smartly (AU or km)
 */
export function formatDistance(km: number): string {
  if (km >= 0.05 * KM_PER_AU) {
    const au = km / KM_PER_AU;
    return `${au.toFixed(2)} AU`;
  }
  if (km >= 1e6) {
    return `${(km / 1e6).toFixed(2)}M km`;
  }
  if (km >= 1e3) {
    return `${(km / 1e3).toFixed(1)}k km`;
  }
  return `${Math.round(km).toLocaleString()} km`;
}

/**
 * Format mass relative to Earth or Sun
 */
export function formatMass(kg: number): string {
  if (kg >= 0.1 * SOLAR_MASS_KG) {
    return `${(kg / SOLAR_MASS_KG).toFixed(2)} M☉`;
  }
  if (kg >= 0.01 * EARTH_MASS_KG) {
    return `${(kg / EARTH_MASS_KG).toFixed(2)} M⊕`;
  }
  if (kg >= 0.001 * MOON_MASS_KG) {
    return `${(kg / MOON_MASS_KG).toFixed(2)} M☽`;
  }
  return `${kg.toExponential(2)} kg`;
}

/**
 * Format radius relative to Earth or Sun
 */
export function formatRadius(km: number): string {
  if (km >= 0.5 * SOLAR_RADIUS_KM) {
    return `${(km / SOLAR_RADIUS_KM).toFixed(2)} R☉`;
  }
  if (km >= 0.1 * EARTH_RADIUS_KM) {
    return `${(km / EARTH_RADIUS_KM).toFixed(2)} R⊕`;
  }
  return `${Math.round(km).toLocaleString()} km`;
}

/**
 * Format velocity in km/s
 */
export function formatVelocity(kmPerSec: number): string {
  return `${kmPerSec.toFixed(2)} km/s`;
}

/**
 * Format time in human readable simulation units
 */
export function formatSimTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const days = seconds / SECONDS_PER_DAY;
  if (days >= 365.25) {
    const years = days / 365.25;
    return `${years.toFixed(2)} yr`;
  }
  if (days >= 1) {
    return `${days.toFixed(1)} d`;
  }
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1)} h`;
  }
  return `${Math.round(seconds)} s`;
}

/** Format effective sim throughput (how much sim time passes per real second). */
export function formatSimRate(timeScale: number): string {
  if (timeScale <= 0) return 'paused';
  return `≈ ${formatSimTime(timeScale)}/s`;
}

/** Format energy in Joules with engineering notation. */
export function formatEnergy(joules: number): string {
  const abs = Math.abs(joules);
  const sign = joules < 0 ? '−' : '';
  if (abs >= 1e30) return `${sign}${(abs / 1e30).toFixed(2)}×10³⁰ J`;
  if (abs >= 1e24) return `${sign}${(abs / 1e24).toFixed(2)}×10²⁴ J`;
  if (abs >= 1e18) return `${sign}${(abs / 1e18).toFixed(2)}×10¹⁸ J`;
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}×10¹² J`;
  return `${sign}${abs.toExponential(2)} J`;
}

/** Format angular momentum magnitude (kg·km²/s). */
export function formatAngularMomentum(l: number): string {
  const abs = Math.abs(l);
  if (abs >= 1e39) return `${(l / 1e39).toFixed(2)}×10³⁹`;
  if (abs >= 1e33) return `${(l / 1e33).toFixed(2)}×10³³`;
  if (abs >= 1e27) return `${(l / 1e27).toFixed(2)}×10²⁷`;
  return `${l.toExponential(2)}`;
}

/** Coarse spectral descriptor from stellar surface temperature. */
export function spectralClassFromTempK(tempK: number): string {
  if (tempK >= 30000) return 'O';
  if (tempK >= 10000) return 'B';
  if (tempK >= 7500) return 'A';
  if (tempK >= 6000) return 'F';
  if (tempK >= 5200) return 'G';
  if (tempK >= 3700) return 'K';
  return 'M';
}
