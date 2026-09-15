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

  // Hill sphere & Roche limit delegated to shared helpers (single formula owner)
  const hillRadiusKm = isBound
    ? calculateHillSphereRadius(semiMajorAxisKm, eccentricity, body.massKg, primary.massKg)
    : null;
  const rocheLimitKm = calculateRocheLimitKm(primary, body);

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

/**
 * Hill sphere radius formula. r_H = a(1 - e) * (m / 3M)^(1/3)
 * Returns null when the parameters cannot define a bounded sphere of influence.
 */
export function calculateHillSphereRadius(
  semiMajorAxisKm: number,
  eccentricity: number,
  bodyMassKg: number,
  primaryMassKg: number
): number | null {
  if (semiMajorAxisKm <= 0 || primaryMassKg <= 0 || bodyMassKg <= 0) return null;
  if (!Number.isFinite(semiMajorAxisKm)) return null;
  return semiMajorAxisKm * (1.0 - eccentricity) * Math.cbrt(bodyMassKg / (3.0 * primaryMassKg));
}

/**
 * Rigid-body Roche limit. d = 2.44 * R_primary * (rho_primary / rho_body)^(1/3)
 * Densities are approximated from mass / radius^3. Returns null when not computable.
 */
export function calculateRocheLimitKm(primary: CelestialBody, body: CelestialBody): number | null {
  if (primary.radiusKm <= 0 || body.radiusKm <= 0 || primary.massKg <= 0 || body.massKg <= 0) {
    return null;
  }
  const rhoPrimary = primary.massKg / (primary.radiusKm ** 3);
  const rhoBody = body.massKg / (body.radiusKm ** 3);
  if (rhoBody <= 0 || !Number.isFinite(rhoBody)) return null;
  return 2.44 * primary.radiusKm * Math.cbrt(rhoPrimary / rhoBody);
}

/**
 * Compute the system barycenter (center of mass) in absolute km.
 * Returns the origin for an empty system.
 */
export function calculateBarycenter(bodies: CelestialBody[]): Vector3D {
  let totalMass = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const b of bodies) {
    totalMass += b.massKg;
    bx += b.massKg * b.position.x;
    by += b.massKg * b.position.y;
    bz += b.massKg * b.position.z;
  }
  if (totalMass <= 0) return { x: 0, y: 0, z: 0 };
  return { x: bx / totalMass, y: by / totalMass, z: bz / totalMass };
}

/**
 * Total system linear angular momentum L = sum(r x p) about the barycenter.
 * Units: kg * km^2 / s. Used for deterministic sigil derivation and system vitals.
 */
export function calculateTotalAngularMomentum(bodies: CelestialBody[]): Vector3D {
  const bary = calculateBarycenter(bodies);
  let lx = 0;
  let ly = 0;
  let lz = 0;
  for (const b of bodies) {
    const rx = b.position.x - bary.x;
    const ry = b.position.y - bary.y;
    const rz = b.position.z - bary.z;
    const px = b.massKg * b.velocity.x;
    const py = b.massKg * b.velocity.y;
    const pz = b.massKg * b.velocity.z;
    lx += ry * pz - rz * py;
    ly += rz * px - rx * pz;
    lz += rx * py - ry * px;
  }
  return { x: lx, y: ly, z: lz };
}

/** Total system mass in kg. */
export function calculateTotalSystemMass(bodies: CelestialBody[]): number {
  return bodies.reduce((acc, b) => acc + b.massKg, 0);
}

/**
 * Full geometric frame of the osculating conic: unit vector toward periapsis,
 * orbit-plane normal, and in-plane bi-normal, all anchored on the primary.
 * This is what lets analytic overlays draw the *true* ellipse in 3D.
 */
export interface KeplerianFrame {
  focus: Vector3D; // primary position (absolute km)
  apsisDir: Vector3D; // unit vector toward periapsis (undefined direction when e ~ 0)
  normal: Vector3D; // unit orbit normal (h direction)
  binormal: Vector3D; // normal x apsisDir (in-plane, 90 deg prograde of periapsis)
  semiMajorAxisKm: number;
  eccentricity: number;
  periodSec: number;
  isBound: boolean;
  trueAnomalyRad: number;
}

export function calculateKeplerianFrame(body: CelestialBody, primary: CelestialBody): KeplerianFrame | null {
  const rx = body.position.x - primary.position.x;
  const ry = body.position.y - primary.position.y;
  const rz = body.position.z - primary.position.z;
  const r = Math.sqrt(rx * rx + ry * ry + rz * rz);

  const vx = body.velocity.x - primary.velocity.x;
  const vy = body.velocity.y - primary.velocity.y;
  const vz = body.velocity.z - primary.velocity.z;

  const mu = G_KM * (primary.massKg + body.massKg);
  if (r <= 0 || mu <= 0) return null;

  // h = r x v
  let hx = ry * vz - rz * vy;
  let hy = rz * vx - rx * vz;
  let hz = rx * vy - ry * vx;
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (hMag <= 1e-9) return null;
  hx /= hMag;
  hy /= hMag;
  hz /= hMag;

  // Eccentricity vector
  const vSq = vx * vx + vy * vy + vz * vz;
  const rDotV = rx * vx + ry * vy + rz * vz;
  const ex = ((vSq - mu / r) * rx - rDotV * vx) / mu;
  const ey = ((vSq - mu / r) * ry - rDotV * vy) / mu;
  const ez = ((vSq - mu / r) * rz - rDotV * vz) / mu;
  const ecc = Math.sqrt(ex * ex + ey * ey + ez * ez);

  const energy = 0.5 * vSq - mu / r;
  const a = Math.abs(energy) > 1e-12 ? -mu / (2.0 * energy) : Infinity;
  const isBound = ecc < 1.0 && a > 0;

  let apsisDir: Vector3D;
  if (ecc > 1e-6) {
    apsisDir = { x: ex / ecc, y: ey / ecc, z: ez / ecc };
  } else {
    // Near-circular: use radial direction as the (arbitrary) apsis reference
    apsisDir = { x: rx / r, y: ry / r, z: rz / r };
  }

  // binormal = normal x apsis
  const bx = hy * apsisDir.z - hz * apsisDir.y;
  const by = hz * apsisDir.x - hx * apsisDir.z;
  const bz = hx * apsisDir.y - hy * apsisDir.x;

  // True anomaly sign-corrected
  let nu = Math.acos(Math.max(-1, Math.min(1, (apsisDir.x * rx + apsisDir.y * ry + apsisDir.z * rz) / r)));
  if (rDotV < 0) nu = 2 * Math.PI - nu;

  return {
    focus: { ...primary.position },
    apsisDir,
    normal: { x: hx, y: hy, z: hz },
    binormal: { x: bx, y: by, z: bz },
    semiMajorAxisKm: a,
    eccentricity: ecc,
    periodSec: isBound ? 2.0 * Math.PI * Math.sqrt((a ** 3) / mu) : Infinity,
    isBound,
    trueAnomalyRad: nu,
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
