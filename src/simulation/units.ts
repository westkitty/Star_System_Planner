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

/**
 * Format a maneuver delta-v budget (BACK11).
 */
export function formatDeltaV(kmPerSec: number): string {
  if (kmPerSec >= 10) return `${kmPerSec.toFixed(1)} km/s Δv`;
  if (kmPerSec >= 1) return `${kmPerSec.toFixed(2)} km/s Δv`;
  return `${(kmPerSec * 1000).toFixed(0)} m/s Δv`;
}

/**
 * Format an energy quantity in joules with SI scaling (BACK11).
 */
export function formatEnergy(joules: number): string {
  const abs = Math.abs(joules);
  const sign = joules < 0 ? '−' : '';
  if (abs >= 1e30) return `${sign}${(abs / 1e30).toFixed(2)} ×10³⁰ J`;
  if (abs >= 1e24) return `${sign}${(abs / 1e24).toFixed(2)} ×10²⁴ J`;
  if (abs >= 1e18) return `${sign}${(abs / 1e18).toFixed(2)} EJ`;
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} TJ`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} GJ`;
  return `${joules.toExponential(2)} J`;
}

/**
 * Format a wall-clock timestamp as a relative "x ago" phrase (BACK11).
 */
export function formatRelativeTime(atMs: number | null, nowMs?: number): string {
  if (atMs === null) return 'never';
  const deltaSec = Math.max(0, ((nowMs ?? Date.now()) - atMs) / 1000);
  if (deltaSec < 5) return 'just now';
  if (deltaSec < 60) return `${Math.floor(deltaSec)}s ago`;
  const minutes = Math.floor(deltaSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(atMs).toLocaleDateString();
}

/**
 * Format simulation elapsed time as a mission-clock stamp (BACK11).
 */
export function formatMissionClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / SECONDS_PER_DAY);
  const hours = Math.floor((s % SECONDS_PER_DAY) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `T+${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format a countdown to a future sim-time event (BACK11).
 */
export function formatCountdown(seconds: number): string {
  if (seconds < 0) return 'overdue';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  return formatSimTime(seconds);
}
