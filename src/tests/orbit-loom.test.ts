import { describe, it, expect } from 'vitest';
import { OrbitLoom } from '../interaction/orbit-loom';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, KM_PER_AU } from '../simulation/units';

describe('Orbit Loom - Conic Ellipse Fitter', () => {
  it('fits an elliptical orbit from sampled stroke points and computes accurate orbital parameters', () => {
    // Mock minimal SceneManager for headless testing
    const mockSceneManager: any = {
      scene: { add: () => {} },
      floatingOrigin: { toRelative: (p: any) => p, toAbsolute: (p: any) => p },
      scaleTransform: {
        getDisplayPosition: (p: any) => p,
        displayToRelativeKm: (p: any) => p,
      },
    };

    const orbitLoom = new OrbitLoom(mockSceneManager);

    const primary: CelestialBody = {
      id: 'star-main',
      name: 'Host Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#fff',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    // Synthesize an elliptical stroke with periapsis = 1.0 AU and apoapsis = 1.5 AU
    const rPeri = KM_PER_AU;
    const rApo = KM_PER_AU * 1.5;
    const aExpected = (rPeri + rApo) / 2.0;
    const eExpected = (rApo - rPeri) / (rApo + rPeri); // 0.5 / 2.5 = 0.2

    // Populate stroke points along the ellipse
    for (let i = 0; i < 30; i++) {
      const theta = (i / 30) * Math.PI * 2;
      const r = (aExpected * (1 - eExpected ** 2)) / (1 + eExpected * Math.cos(theta));
      // Feed points directly into strokePointsKm array
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

    // Verify periapsis velocity is sufficient to stay in bound orbit
    const speed = Math.hypot(
      fitted.periapsisVelocityKmS.x,
      fitted.periapsisVelocityKmS.y,
      fitted.periapsisVelocityKmS.z
    );
    expect(speed).toBeGreaterThan(20);
    expect(speed).toBeLessThan(40);
  });

  it('allows interactive handle adjustment of periapsis and apoapsis', () => {
    const mockSceneManager: any = {
      scene: { add: () => {} },
      floatingOrigin: { toRelative: (p: any) => p, toAbsolute: (p: any) => p },
      scaleTransform: {
        getDisplayPosition: (p: any) => p,
        displayToRelativeKm: (p: any) => p,
      },
    };

    const orbitLoom = new OrbitLoom(mockSceneManager);
    const primary: CelestialBody = {
      id: 'star-main',
      name: 'Host Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#fff',
    };

    orbitLoom.setPrimary(primary);
    orbitLoom.startStroke();

    for (let i = 0; i < 20; i++) {
      const theta = (i / 20) * Math.PI * 2;
      (orbitLoom as any).strokePointsKm.push({
        x: KM_PER_AU * Math.cos(theta),
        y: 0,
        z: KM_PER_AU * Math.sin(theta),
      });
    }

    orbitLoom.fitConicFromStroke();
    expect(orbitLoom.currentFittedOrbit).not.toBeNull();

    // Adjust periapsis inward
    orbitLoom.setPeriapsis(KM_PER_AU * 0.7);
    expect(orbitLoom.currentFittedOrbit?.periapsisKm).toBeCloseTo(KM_PER_AU * 0.7, -4);
    expect(orbitLoom.currentFittedOrbit?.eccentricity).toBeGreaterThan(0.1);
  });
});
