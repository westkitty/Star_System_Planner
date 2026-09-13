/**
 * Analytical Keplerian & Osculating Orbital Mechanics.
 * 
 * Computes:
 * - Specific mechanical energy and angular momentum vector
 * - Eccentricity, semi-major axis, inclination, periapsis, apoapsis
 * - Bound / unbound / hyperbolic escape classification
 * - Orbital period
 * - Hill sphere radius and Roche limit
 * - Low-order mean-motion resonances (2:1, 3:2, 4:3, 5:2, 3:1)
 * - Lagrange point coordinates (L1 - L5)
 */

import { CelestialBody, OsculatingElements, Vector3D } from './types';
import { G_KM } from './units';

/**
 * Compute the dominant gravitating primary for a given body if not explicitly set.
 */
export function findDominantPrimary(body: CelestialBody, allBodies: CelestialBody[]): CelestialBody | null {
  if (body.primaryId) {
    const explicit = allBodies.find(b => b.id === body.primaryId);
    if (explicit) return explicit;
  }

  // Find the body exerting the strongest gravitational pull (G * M / r^2)
  let maxPull = 0;
  let dominant: CelestialBody | null = null;

  for (const other of allBodies) {
    if (other.id === body.id) continue;
    // Primary should typically have greater mass
    if (other.massKg <= body.massKg) continue;

    const dx = other.position.x - body.position.x;
    const dy = other.position.y - body.position.y;
    const dz = other.position.z - body.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq <= 0) continue;

    const pull = other.massKg / distSq;
    if (pull > maxPull) {
      maxPull = pull;
      dominant = other;
    }
  }

  return dominant;
}

/**
 * Calculate osculating orbital elements for `body` relative to `primary`.
 */
export function calculateOsculatingElements(
  body: CelestialBody,
  primary: CelestialBody
): OsculatingElements {
  // Relative position and velocity
  const rx = body.position.x - primary.position.x;
  const ry = body.position.y - primary.position.y;
  const rz = body.position.z - primary.position.z;
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const vx = body.velocity.x - primary.velocity.x;
  const vy = body.velocity.y - primary.velocity.y;
  const vz = body.velocity.z - primary.velocity.z;
  const vSq = vx * vx + vy * vy + vz * vz;

  // Gravitational parameter mu = G * (M + m)
  const mu = G_KM * (primary.massKg + body.massKg);

  if (r <= 0 || mu <= 0) {
    return createEmptyElements();
  }

  // Specific angular momentum h = r x v
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h = Math.sqrt(hx * hx + hy * hy + hz * hz);

  // Specific orbital energy E = v^2 / 2 - mu / r
  const energy = 0.5 * vSq - mu / r;

  // Semi-major axis a = -mu / (2 * E)
  const semiMajorAxisKm = Math.abs(energy) > 1e-12 ? -mu / (2.0 * energy) : Infinity;

  // Eccentricity vector e = ((v x h) / mu) - (r / |r|)
  const vCrossHx = vy * hz - vz * hy;
  const vCrossHy = vz * hx - vx * hz;
  const vCrossHz = vx * hy - vy * hx;

  const ex = vCrossHx / mu - rx / r;
  const ey = vCrossHy / mu - ry / r;
  const ez = vCrossHz / mu - rz / r;
  const eccentricity = Math.sqrt(ex * ex + ey * ey + ez * ez);

  // Inclination i = arccos(h_z / h)
  const inclinationDeg = h > 0 ? (Math.acos(Math.max(-1, Math.min(1, hz / h))) * 180.0) / Math.PI : 0;

  // Periapsis and Apoapsis
  let periapsisKm = 0;
  let apoapsisKm = 0;
  let isBound = false;
  let isHyperbolicEscape = false;
  let periodSec = 0;

  if (eccentricity < 1.0 && semiMajorAxisKm > 0) {
    // Elliptical / Bound orbit
    isBound = true;
    periapsisKm = semiMajorAxisKm * (1.0 - eccentricity);
    apoapsisKm = semiMajorAxisKm * (1.0 + eccentricity);
    periodSec = 2.0 * Math.PI * Math.sqrt((semiMajorAxisKm ** 3) / mu);
  } else {
    // Parabolic or Hyperbolic
    isBound = false;
    isHyperbolicEscape = true;
    periapsisKm = Math.abs(semiMajorAxisKm) * Math.abs(1.0 - eccentricity);
    apoapsisKm = Infinity;
    periodSec = Infinity;
  }

  // Mean motion n = sqrt(mu / a^3) for bound
  const meanMotionRadSec = isBound ? Math.sqrt(mu / (semiMajorAxisKm ** 3)) : 0;

  // True anomaly nu = arccos((e . r) / (|e| * |r|))
  let trueAnomalyDeg = 0;
  if (eccentricity > 1e-6) {
    const eDotR = ex * rx + ey * ry + ez * rz;
    const cosNu = Math.max(-1, Math.min(1, eDotR / (eccentricity * r)));
    trueAnomalyDeg = (Math.acos(cosNu) * 180.0) / Math.PI;
    // Check if r . v < 0 (moving toward periapsis)
    const rDotV = rx * vx + ry * vy + rz * vz;
    if (rDotV < 0) {
      trueAnomalyDeg = 360.0 - trueAnomalyDeg;
    }
  }

  // Hill sphere: r_H = a * (1 - e) * (m / (3 * M))^(1/3)
  let hillRadiusKm: number | null = null;
  if (isBound && primary.massKg > 0) {
    hillRadiusKm = semiMajorAxisKm * (1.0 - eccentricity) * Math.cbrt(body.massKg / (3.0 * primary.massKg));
  }

  // Roche limit: d = 2.44 * R_primary * (rho_primary / rho_body)^(1/3)
  // Simplified using mass / radius^3 approximations
  let rocheLimitKm: number | null = null;
  if (primary.radiusKm > 0 && body.radiusKm > 0) {
    const rhoPrimary = primary.massKg / (primary.radiusKm ** 3);
    const rhoBody = body.massKg / (body.radiusKm ** 3);
    if (rhoBody > 0) {
      rocheLimitKm = 2.44 * primary.radiusKm * Math.cbrt(rhoPrimary / rhoBody);
    }
  }

  return {
    semiMajorAxisKm,
    eccentricity,
    inclinationDeg,
    periapsisKm,
    apoapsisKm,
    periodSec,
    isBound,
    isHyperbolicEscape,
    trueAnomalyDeg,
    meanMotionRadSec,
    hillRadiusKm,
    rocheLimitKm,
    equilibriumTempK: body.temperatureK ?? null,
  };
}

function createEmptyElements(): OsculatingElements {
  return {
    semiMajorAxisKm: 0,
    eccentricity: 0,
    inclinationDeg: 0,
    periapsisKm: 0,
    apoapsisKm: 0,
    periodSec: 0,
    isBound: false,
    isHyperbolicEscape: false,
    trueAnomalyDeg: 0,
    meanMotionRadSec: 0,
    hillRadiusKm: null,
    rocheLimitKm: null,
    equilibriumTempK: null,
  };
}

/**
 * Detect low-order mean motion orbital resonances between two orbiting bodies.
 */
export interface ResonanceDetection {
  ratioName: string; // e.g. "2:1", "3:2"
  ratioValue: number;
  differencePercent: number;
}

const RESONANCE_RATIOS = [
  { name: '1:1', value: 1.0 },
  { name: '2:1', value: 2.0 },
  { name: '3:2', value: 1.5 },
  { name: '4:3', value: 1.3333 },
  { name: '5:2', value: 2.5 },
  { name: '3:1', value: 3.0 },
];

export function detectResonance(periodA: number, periodB: number): ResonanceDetection | null {
  if (periodA <= 0 || periodB <= 0 || !Number.isFinite(periodA) || !Number.isFinite(periodB)) {
    return null;
  }

  const pLong = Math.max(periodA, periodB);
  const pShort = Math.min(periodA, periodB);
  const actualRatio = pLong / pShort;

  for (const cand of RESONANCE_RATIOS) {
    const diffPct = Math.abs(actualRatio - cand.value) / cand.value;
    if (diffPct <= 0.03) {
      // Within 3%
      return {
        ratioName: cand.name,
        ratioValue: cand.value,
        differencePercent: diffPct * 100,
      };
    }
  }

  return null;
}

/**
 * Approximate Lagrange Points (L1 - L5) for a secondary body orbiting a primary in the orbital plane.
 */
export interface LagrangePoints {
  L1: Vector3D;
  L2: Vector3D;
  L3: Vector3D;
  L4: Vector3D;
  L5: Vector3D;
}

export function computeLagrangePoints(primary: CelestialBody, secondary: CelestialBody): LagrangePoints | null {
  const dx = secondary.position.x - primary.position.x;
  const dy = secondary.position.y - primary.position.y;
  const dz = secondary.position.z - primary.position.z;
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (r <= 0 || primary.massKg <= 0 || secondary.massKg <= 0) return null;

  // Normalized separation vector
  const nx = dx / r;
  const ny = dy / r;
  const nz = dz / r;

  // Mass ratio alpha = m2 / (3 * m1)^(1/3)
  const alpha = Math.cbrt(secondary.massKg / (3.0 * (primary.massKg + secondary.massKg)));
  const hillRadius = r * alpha;

  // Normal to orbit plane (from velocity or default up)
  const vx = secondary.velocity.x - primary.velocity.x;
  const vy = secondary.velocity.y - primary.velocity.y;
  const vz = secondary.velocity.z - primary.velocity.z;

  // h = r x v
  let hx = ny * vz - nz * vy;
  let hy = nz * vx - nx * vz;
  let hz = nx * vy - ny * vx;
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (hMag > 0) {
    hx /= hMag;
    hy /= hMag;
    hz /= hMag;
  } else {
    hx = 0;
    hy = 1;
    hz = 0;
  }

  // Orthogonal in-plane vector = h x n
  const perpX = hy * nz - hz * ny;
  const perpY = hz * nx - hx * nz;
  const perpZ = hx * ny - hy * nx;

  // L1: between primary and secondary, inside Hill sphere
  const L1: Vector3D = {
    x: secondary.position.x - nx * hillRadius,
    y: secondary.position.y - ny * hillRadius,
    z: secondary.position.z - nz * hillRadius,
  };

  // L2: outside secondary, along primary-secondary line
  const L2: Vector3D = {
    x: secondary.position.x + nx * hillRadius,
    y: secondary.position.y + ny * hillRadius,
    z: secondary.position.z + nz * hillRadius,
  };

  // L3: opposite side of primary
  const L3: Vector3D = {
    x: primary.position.x - nx * r,
    y: primary.position.y - ny * r,
    z: primary.position.z - nz * r,
  };

  // L4 and L5: Equilateral triangles (60 degrees ahead and behind)
  // r * cos(60) = 0.5 * r along n, r * sin(60) = 0.866 * r along perp
  const cos60 = 0.5;
  const sin60 = Math.sqrt(3) / 2.0;

  const L4: Vector3D = {
    x: primary.position.x + (nx * cos60 + perpX * sin60) * r,
    y: primary.position.y + (ny * cos60 + perpY * sin60) * r,
    z: primary.position.z + (nz * cos60 + perpZ * sin60) * r,
  };

  const L5: Vector3D = {
    x: primary.position.x + (nx * cos60 - perpX * sin60) * r,
    y: primary.position.y + (ny * cos60 - perpY * sin60) * r,
    z: primary.position.z + (nz * cos60 - perpZ * sin60) * r,
  };

  return { L1, L2, L3, L4, L5 };
}

export interface TrojanBerth {
  position: Vector3D;
  velocity: Vector3D;
}

export interface TrojanPairPlan {
  l4: TrojanBerth;
  l5: TrojanBerth;
}

/**
 * Trojan camp berths (iteration 3, GAME11).
 *
 * Honest L4/L5 co-orbital slots: equilateral-triangle positions from the
 * Lagrange solver, with rigid-rotation velocities derived from the
 * planet's own angular velocity so spawned camps actually stay camped.
 */
export function planTrojanPair(planet: CelestialBody, primary: CelestialBody): TrojanPairPlan | null {
  if (planet.id === primary.id) return null;
  const points = computeLagrangePoints(primary, planet);
  if (!points) return null;

  const rx = planet.position.x - primary.position.x;
  const ry = planet.position.y - primary.position.y;
  const rz = planet.position.z - primary.position.z;
  const vx = planet.velocity.x - primary.velocity.x;
  const vy = planet.velocity.y - primary.velocity.y;
  const vz = planet.velocity.z - primary.velocity.z;
  const r2 = rx * rx + ry * ry + rz * rz;
  if (!(r2 > 0)) return null;
  // omega = (r x v) / |r|^2
  const ox = (ry * vz - rz * vy) / r2;
  const oy = (rz * vx - rx * vz) / r2;
  const oz = (rx * vy - ry * vx) / r2;

  const berth = (at: Vector3D): TrojanBerth => {
    const dx = at.x - primary.position.x;
    const dy = at.y - primary.position.y;
    const dz = at.z - primary.position.z;
    // v = v_primary + omega x d
    return {
      position: { x: at.x, y: at.y, z: at.z },
      velocity: {
        x: primary.velocity.x + (oy * dz - oz * dy),
        y: primary.velocity.y + (oz * dx - ox * dz),
        z: primary.velocity.z + (ox * dy - oy * dx),
      },
    };
  };
  return { l4: berth(points.L4), l5: berth(points.L5) };
}
