import { describe, it, expect } from 'vitest';
import { OrbitLoom } from '../interaction/orbit-loom';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, KM_PER_AU } from '../simulation/units';

describe('Orbit Loom - End-to-End Conic Fitting & Commitment', () => {
  const createMockSceneManager = () => ({
    scene: { add: () => {} },
    floatingOrigin: { toRelative: (p: any) => p, toAbsolute: (p: any) => p },
    scaleTransform: {
      getDisplayPosition: (p: any) => p,
      displayToRelativeKm: (p: any) => p,
    },
    raycastOrbitalPlane: () => ({ x: 0, y: 0, z: 0 }),
  });

  it('fits an elliptical orbit from sampled stroke points and computes accurate orbital parameters', () => {
    const orbitLoom = new OrbitLoom(createMockSceneManager() as any);

    const primary: CelestialBody = {
      id: 'star-main',
      name: 'Host Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 10, y: 0, z: 5 }, // Host star is moving through space
      fixed: false,
      color: '#fff',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    // Synthesize an elliptical stroke with periapsis = 1.0 AU and apoapsis = 1.5 AU
    const rPeri = KM_PER_AU;
    const rApo = KM_PER_AU * 1.5;
    const aExpected = (rPeri + rApo) / 2.0;
    const eExpected = (rApo - rPeri) / (rApo + rPeri); // 0.2

    for (let i = 0; i < 30; i++) {
      const theta = (i / 30) * Math.PI * 2;
      const r = (aExpected * (1 - eExpected ** 2)) / (1 + eExpected * Math.cos(theta));
      (orbitLoom as any).strokePointsKm.push({
        x: r * Math.cos(theta),
        y: 0,
        z: r * Math.sin(theta),
      });
    }

    const fitted = orbitLoom.fitConicFromStroke();

    expect(fitted).not.toBeNull();
    if (!fitted) return;

    expect(fitted.primaryId).toBe('star-main');
    expect(fitted.semiMajorAxisKm).toBeCloseTo(aExpected, -4);
    expect(fitted.eccentricity).toBeCloseTo(eExpected, 2);
    expect(fitted.isBound).toBe(true);

    const speed = Math.hypot(
      fitted.periapsisVelocityKmS.x,
      fitted.periapsisVelocityKmS.y,
      fitted.periapsisVelocityKmS.z
    );
    expect(speed).toBeGreaterThan(20);
    expect(speed).toBeLessThan(40);
  });

  it('APPLY TO SELECTED BODY moves body onto fitted orbit and assigns coherent inertial velocity', () => {
    const orbitLoom = new OrbitLoom(createMockSceneManager() as any);

    const primary: CelestialBody = {
      id: 'star-main',
      name: 'Host Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 1e6, y: 0, z: 2e6 },
      velocity: { x: 12.0, y: 0, z: -8.0 }, // Non-zero inertial velocity of primary
      fixed: false,
      color: '#fff',
    };

    const moon: CelestialBody = {
      id: 'moon-target',
      name: 'Selected World',
      type: 'planet',
      massKg: 6e24,
      radiusKm: 6400,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#38bdf8',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    // Generate circular orbit stroke at 1 AU
    for (let i = 0; i < 20; i++) {
      const theta = (i / 20) * Math.PI * 2;
      (orbitLoom as any).strokePointsKm.push({
        x: primary.position.x + KM_PER_AU * Math.cos(theta),
        y: 0,
        z: primary.position.z + KM_PER_AU * Math.sin(theta),
      });
    }

    const fitted = orbitLoom.fitConicFromStroke();
    expect(fitted).not.toBeNull();

    // Commit to selected moon
    const success = orbitLoom.applyToBody(moon);
    expect(success).toBe(true);

    // 1. Position must match periapsis coordinate
    expect(moon.position.x).toBeCloseTo(fitted!.periapsisPositionKm.x, -2);
    expect(moon.position.z).toBeCloseTo(fitted!.periapsisPositionKm.z, -2);

    // 2. Velocity must include primary's inertial movement: v_inertial = v_primary + v_orbital
    expect(moon.velocity.x).toBeCloseTo(primary.velocity.x + fitted!.periapsisVelocityKmS.x, 3);
    expect(moon.velocity.z).toBeCloseTo(primary.velocity.z + fitted!.periapsisVelocityKmS.z, 3);

    // 3. Primary ID assigned
    expect(moon.primaryId).toBe('star-main');

    // 4. Preview cleared after commit
    expect(orbitLoom.currentFittedOrbit).toBeNull();
  });

  it('CREATE ORBITAL RING generates a real RingStructure on the primary', () => {
    const orbitLoom = new OrbitLoom(createMockSceneManager() as any);

    const primary: CelestialBody = {
      id: 'gas-giant',
      name: 'Aurelia',
      type: 'planet',
      classification: 'gas_giant',
      massKg: 1e27,
      radiusKm: 60000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#f59e0b',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    for (let i = 0; i < 20; i++) {
      const theta = (i / 20) * Math.PI * 2;
      (orbitLoom as any).strokePointsKm.push({
        x: 120000 * Math.cos(theta),
        y: 0,
        z: 120000 * Math.sin(theta),
      });
    }

    orbitLoom.fitConicFromStroke();
    const ring = orbitLoom.commitToRing('Aurelia Outer Ring');

    expect(ring).not.toBeNull();
    expect(ring?.name).toBe('Aurelia Outer Ring');
    expect(ring?.innerRadiusKm).toBeCloseTo(120000 * 0.98, -2);
    expect(ring?.outerRadiusKm).toBeCloseTo(120000 * 1.02, -2);
    expect(orbitLoom.currentFittedOrbit).toBeNull();
  });

  it('CANCEL clears fitted orbit preview with zero mutation to bodies', () => {
    const orbitLoom = new OrbitLoom(createMockSceneManager() as any);

    const primary: CelestialBody = {
      id: 'star-1',
      name: 'Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#fff',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    for (let i = 0; i < 15; i++) {
      (orbitLoom as any).strokePointsKm.push({ x: 1e8, y: 0, z: 1e8 });
    }

    orbitLoom.clear();
    expect(orbitLoom.currentFittedOrbit).toBeNull();
    expect((orbitLoom as any).strokePointsKm.length).toBe(0);
    // Primary remains completely unchanged
    expect(primary.position.x).toBe(0);
  });
});
