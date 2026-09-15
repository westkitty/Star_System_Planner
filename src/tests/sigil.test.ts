import { describe, it, expect } from 'vitest';
import { generateSystemSigilSvg } from '../persistence/sigil';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';

function star(over: Partial<CelestialBody> = {}): CelestialBody {
  return {
    id: 'star-1',
    name: 'Virgil',
    type: 'star',
    massKg: SOLAR_MASS_KG,
    radiusKm: 696000,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    color: '#ffd066',
    temperatureK: 5778,
    ...over,
  };
}

function planet(id: string, dist: number, speed: number): CelestialBody {
  return {
    id,
    name: id,
    type: 'planet',
    massKg: 6e24,
    radiusKm: 6371,
    position: { x: dist, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: speed },
    color: '#4488ee',
  };
}

describe('State-derived system sigil — the fingerprint must follow the physics', () => {
  it('is deterministic for identical state', () => {
    const bodies = [star(), planet('p1', 1.5e8, 29.8)];
    const a = generateSystemSigilSvg('Kallisto', bodies);
    const b = generateSystemSigilSvg('Kallisto', bodies);
    expect(a).toBe(b);
    expect(a).toContain('<svg');
  });

  it('changes when the body count changes (density follows architecture)', () => {
    const cold = [star(), planet('p1', 1.5e8, 29.8)];
    const busy = [...cold, planet('p2', 3e8, 17), planet('p3', 6e8, 10)];
    expect(generateSystemSigilSvg('Kallisto', cold))
      .not.toBe(generateSystemSigilSvg('Kallisto', busy));
  });

  it('changes with total angular momentum, not just with the name', () => {
    const slow = [star(), planet('p1', 1.5e8, 5)];
    const fast = [star(), planet('p1', 1.5e8, 45)];
    expect(generateSystemSigilSvg('Kallisto', slow))
      .not.toBe(generateSystemSigilSvg('Kallisto', fast));
  });

  it('flips to the crimson regime when the star is destroyed', () => {
    const alive = [star(), planet('p1', 1.5e8, 29.8)];
    const dead = [star({ temperatureK: 0, luminosityW: 0 }), planet('p1', 1.5e8, 29.8)];
    const aSvg = generateSystemSigilSvg('Kallisto', alive);
    const dSvg = generateSystemSigilSvg('Kallisto', dead);
    expect(dSvg).not.toBe(aSvg);
    expect(dSvg).toContain('#ff4d64'); // crimson extinction palette
  });

  it('a black hole seed never borrows the living-star palette', () => {
    const bh = star({ id: 'bh', type: 'black_hole', temperatureK: 1, luminosityW: 1, color: '#111' });
    const withStar = [star(), planet('p1', 1.5e8, 29.8)];
    const withBH = [bh, planet('p1', 1.5e8, 29.8)];
    expect(generateSystemSigilSvg('Kallisto', withBH))
      .not.toBe(generateSystemSigilSvg('Kallisto', withStar));
  });
});
