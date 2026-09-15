import { describe, it, expect, beforeAll } from 'vitest';
import { OrbitLoom, FittedOrbit } from '../interaction/orbit-loom';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';

const createMockScene = () => ({
  scene: { add: () => {}, remove: () => {} },
  floatingOrigin: {
    toRelative: (p: any) => p,
    toAbsolute: (p: any) => p,
  },
  scaleTransform: {
    getDisplayPosition: (p: any) => p,
    displayToRelativeKm: (p: any) => p,
    getDisplayRadius: (r: number) => r,
  },
  raycastOrbitalPlane: () => ({ x: 1, y: 0, z: 1 }),
});

// THREE requires WebGL only at render time; constructing meshes is CPU-safe in node.


describe('Orbit Loom conic sculpting — inclination & belt commitments', () => {
  let loom: OrbitLoom;
  const primary: CelestialBody = {
    id: 'star-1', name: 'Host', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000,
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#ffd066',
  };

  const seedFittedOrbit = () => {
    (loom as any).currentFittedOrbit = {
      periapsisKm: 1.0e8,
      apoapsisKm: 2.0e8,
      semiMajorAxisKm: 1.5e8,
      eccentricity: 1 / 3,
      periodSec: 0,
      periapsisAngleRad: 0.4,
      inclinationDeg: 0,
      periapsisPositionKm: { x: 0, y: 0, z: 0 },
      periapsisVelocityKmS: { x: 0, y: 0, z: 0 },
      planeNormal: { x: 0, y: -1, z: 0 },
    } as FittedOrbit;
    (loom as any).recomputeParameters();
  };

  beforeAll(() => {
    loom = new OrbitLoom(createMockScene() as any);
    loom.setPrimary(primary);
    seedFittedOrbit();
  });

  it('setInclination tilts the orbital plane out of the ecliptic', () => {
    loom.setInclination(45);
    const orbit = (loom as any).currentFittedOrbit;
    expect(orbit.inclinationDeg).toBe(45);
    // a tilted orbit must leave the Y=0 plane — periapsis velocity gains a Y component
    const flat = Math.abs((loom as any).currentFittedOrbit.periapsisVelocityKmS.y);
    expect(flat).toBeGreaterThan(0.1);
    // plane normal no longer axis-aligned
    const n = orbit.planeNormal;
    const tilted = Math.abs(n.x) + Math.abs(n.z);
    expect(tilted).toBeGreaterThan(0.01);
  });

  it('inclination clamps to ±90 and never inverts the apsis distances', () => {
    loom.setInclination(720);
    let orbit = (loom as any).currentFittedOrbit;
    expect(orbit.inclinationDeg).toBe(90);
    loom.setInclination(-300);
    orbit = (loom as any).currentFittedOrbit;
    expect(orbit.inclinationDeg).toBe(-90);
    expect(orbit.periapsisKm).toBeCloseTo(1.0e8, 4);
    expect(orbit.apoapsisKm).toBeCloseTo(2.0e8, 4);
  });

  it('setPeriapsis / setApoapsis reshape a and e and recompute the period', () => {
    loom.setInclination(0);
    loom.setPeriapsis(1.2e8);
    loom.setApoapsis(2.4e8);
    const orbit = (loom as any).currentFittedOrbit;
    expect(orbit.periapsisKm).toBeCloseTo(1.2e8, 4);
    expect(orbit.apoapsisKm).toBeCloseTo(2.4e8, 4);
    expect(orbit.semiMajorAxisKm).toBeCloseTo(1.8e8, 4);
    // Kepler 3rd law: T = 2π√(a³/μ) for a solar-mass primary
    const mu = 6.67430e-20 * SOLAR_MASS_KG;
    const expected = 2 * Math.PI * Math.sqrt(Math.pow(1.8e8, 3) / mu);
    expect(orbit.periodSec).toBeCloseTo(expected, -1);
  });

  it('setApoapsis can never dip below current periapsis', () => {
    loom.setApoapsis(1.1e8); // below periapsis 1.2e8 → must clamp
    const orbit = (loom as any).currentFittedOrbit;
    expect(orbit.apoapsisKm).toBeGreaterThanOrEqual(orbit.periapsisKm);
  });

  it('commitToBelt emits a valid belt descriptor inside the fitted radii', () => {
    loom.setPeriapsis(1.0e8);
    loom.setApoapsis(2.0e8);
    const belt = loom.commitToBelt('Test Verge', 900);
    expect(belt).toBeTruthy();
    expect(belt!.primaryId).toBe('star-1');
    expect(belt!.particleCount).toBe(900);
    expect(belt!.innerRadiusKm).toBeLessThanOrEqual(1.0e8);
    expect(belt!.outerRadiusKm).toBeGreaterThanOrEqual(2.0e8);
    expect(belt!.innerRadiusKm).toBeGreaterThan(0);
  });

  it('belt particle count clamps into the instancing window', () => {
    seedFittedOrbit();
    const belt2 = loom.commitToBelt('W', 999999);
    expect(belt2).toBeTruthy();
    expect(belt2!.particleCount).toBeLessThanOrEqual(3000);
    seedFittedOrbit();
    const belt3 = loom.commitToBelt('X', 1);
    expect(belt3).toBeTruthy();
    expect(belt3!.particleCount).toBeGreaterThanOrEqual(60);
  });
});
