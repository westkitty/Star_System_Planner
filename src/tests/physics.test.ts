import { describe, it, expect } from 'vitest';
import { CelestialBody } from '../simulation/types';
import { G_KM, SOLAR_MASS_KG, KM_PER_AU, EARTH_MASS_KG } from '../simulation/units';
import { stepVelocityVerlet, calculateSystemEnergy } from '../simulation/integrator';
import { resolveCollisions } from '../simulation/collisions';
import { calculateOsculatingElements, detectResonance } from '../simulation/orbital-mechanics';

describe('Physics Engine - Symplectic Keplerian Mechanics', () => {
  it('calculates theoretical circular orbit velocity correctly', () => {
    // Star: 1 Solar mass
    // Planet at 1 AU
    const M = SOLAR_MASS_KG;
    const r = KM_PER_AU;
    const vExpected = Math.sqrt((G_KM * M) / r); // ~ 29.78 km/s

    expect(vExpected).toBeGreaterThan(29.7);
    expect(vExpected).toBeLessThan(29.9);
  });

  it('preserves circular orbit stability and energy drift over 1000 steps', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Sun',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#ffd700',
    };

    const r = KM_PER_AU;
    const vOrb = Math.sqrt((G_KM * SOLAR_MASS_KG) / r);

    const planet: CelestialBody = {
      id: 'planet-1',
      name: 'Earth',
      type: 'planet',
      massKg: EARTH_MASS_KG,
      radiusKm: 6371,
      position: { x: r, y: 0, z: 0 },
      velocity: { x: 0, y: vOrb, z: 0 },
      color: '#2277ff',
    };

    const bodies = [star, planet];
    const initialEnergy = calculateSystemEnergy(bodies).total;

    // Step for 1000 steps of 60s (standard 1-minute engine fixed step)
    const dt = 60;
    for (let i = 0; i < 1000; i++) {
      const ok = stepVelocityVerlet(bodies, dt);
      expect(ok).toBe(true);
    }

    const finalEnergy = calculateSystemEnergy(bodies).total;
    const energyDrift = Math.abs((finalEnergy - initialEnergy) / initialEnergy);

    // With 60s steps, energy drift and radius variation are extremely small (< 2e-4)
    expect(energyDrift).toBeLessThan(2e-4);

    // Orbit radius should stay very close to 1 AU
    const currentR = Math.sqrt(planet.position.x ** 2 + planet.position.y ** 2 + planet.position.z ** 2);
    expect(Math.abs(currentR - r) / r).toBeLessThan(1e-4);
  });

  it('correctly calculates osculating elements for an eccentric orbit', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Central Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#ffffff',
    };

    // Give planet a velocity slightly less than circular to produce an ellipse with periapsis at current r
    const r = KM_PER_AU;
    const vCirc = Math.sqrt((G_KM * SOLAR_MASS_KG) / r);
    const vEcc = vCirc * 0.85;

    const planet: CelestialBody = {
      id: 'planet-ecc',
      name: 'Eccentric Planet',
      type: 'planet',
      massKg: EARTH_MASS_KG,
      radiusKm: 6371,
      position: { x: r, y: 0, z: 0 },
      velocity: { x: 0, y: vEcc, z: 0 },
      color: '#aa88ff',
    };

    const elements = calculateOsculatingElements(planet, star);

    expect(elements.isBound).toBe(true);
    expect(elements.isHyperbolicEscape).toBe(false);
    expect(elements.eccentricity).toBeGreaterThan(0.2);
    expect(elements.eccentricity).toBeLessThan(0.4);
    expect(elements.periapsisKm).toBeLessThan(r + 1000);
    expect(elements.apoapsisKm).toBeGreaterThan(r);
  });

  it('identifies hyperbolic escape velocity', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Central Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#ffffff',
    };

    const r = KM_PER_AU;
    const vEscape = Math.sqrt((2 * G_KM * SOLAR_MASS_KG) / r);

    const escapingBody: CelestialBody = {
      id: 'comet-escape',
      name: 'Oumuamua Analog',
      type: 'planet',
      massKg: 1e15,
      radiusKm: 10,
      position: { x: r, y: 0, z: 0 },
      velocity: { x: 0, y: vEscape * 1.2, z: 0 }, // Super-escape speed
      color: '#ff4444',
    };

    const elements = calculateOsculatingElements(escapingBody, star);
    expect(elements.isBound).toBe(false);
    expect(elements.isHyperbolicEscape).toBe(true);
    expect(elements.eccentricity).toBeGreaterThan(1.0);
  });

  it('conserves linear momentum and volume upon collision merge', () => {
    const bodyA: CelestialBody = {
      id: 'body-a',
      name: 'Target Planet',
      type: 'planet',
      massKg: 1000,
      radiusKm: 10,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 10, y: 0, z: 0 },
      color: '#44bbff',
    };

    const bodyB: CelestialBody = {
      id: 'body-b',
      name: 'Impactor Moon',
      type: 'moon',
      massKg: 1000,
      radiusKm: 10,
      position: { x: 15, y: 0, z: 0 }, // Overlaps threshold (10 + 10 = 20)
      velocity: { x: -10, y: 0, z: 0 },
      color: '#888888',
    };

    const bodies = [bodyA, bodyB];
    const events = resolveCollisions(bodies, 100);

    expect(events.length).toBe(1);
    expect(bodies.length).toBe(1);

    const survivor = bodies[0];
    expect(survivor.massKg).toBe(2000);
    // Momentum before: 1000*10 + 1000*(-10) = 0
    // Result velocity must be 0
    expect(survivor.velocity.x).toBeCloseTo(0);
    // Combined radius based on volume: cbrt(10^3 + 10^3) = 10 * cbrt(2) ~ 12.599
    expect(survivor.radiusKm).toBeCloseTo(10 * Math.cbrt(2), 2);
  });

  it('detects low-order mean motion resonances', () => {
    const res21 = detectResonance(200, 100); // 2:1
    expect(res21?.ratioName).toBe('2:1');

    const res32 = detectResonance(300, 201); // ~ 3:2 within 1%
    expect(res32?.ratioName).toBe('3:2');

    const noRes = detectResonance(173, 100); // 1.73 (not a low order resonance)
    expect(noRes).toBeNull();
  });

  it('safely handles divide-by-zero or collocated bodies without crashing', () => {
    const bodyA: CelestialBody = {
      id: 'sing-a',
      name: 'Singularity A',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 100,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#fff',
    };
    const bodyB: CelestialBody = {
      id: 'sing-b',
      name: 'Singularity B',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 100,
      position: { x: 0, y: 0, z: 0 }, // Exactly collocated!
      velocity: { x: 0, y: 0, z: 0 },
      color: '#fff',
    };

    const ok = stepVelocityVerlet([bodyA, bodyB], 10);
    expect(ok).toBe(true);
    expect(Number.isFinite(bodyA.velocity.x)).toBe(true);
  });
});
