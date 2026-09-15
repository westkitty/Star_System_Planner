import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/engine';
import { CelestialBody, ConsequenceEvent } from '../simulation/types';
import { SOLAR_MASS_KG, EARTH_MASS_KG } from '../simulation/units';

function star(): CelestialBody {
  return {
    id: 'star-1', name: 'Host', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000,
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#ffd066',
  };
}

describe('Catastrophe pipeline — collision hook, Roche shredding, impact strength', () => {
  it('fires onCatastrophe exactly once per collision event with catastrophe severity', () => {
    const engine = new SimulationEngine([star()], { enableCollisions: true });
    const oncoming: CelestialBody = {
      id: 'doom-1', name: 'Doom', type: 'planet', massKg: EARTH_MASS_KG, radiusKm: 6371,
      // already overlapping the star's surface — merge is inevitable next substep
      position: { x: 200000, y: 0, z: 0 }, velocity: { x: -60, y: 0, z: 0 }, color: '#ff8888',
    };
    engine.addBody(oncoming);

    const fired: ConsequenceEvent[] = [];
    engine.onCatastrophe = (ev) => fired.push(ev);

    // update() throttles into 60 s quanta behind an accumulator (by design:
    // per-frame real deltas clamp to 0.1 s). The analysis API stepOnce()
    // integrates exactly one fixed step per call — use it for determinism.
    for (let i = 0; i < 4; i++) engine.stepOnce();

    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every(e => e.severity === 'catastrophe')).toBe(true);
    // the smaller body must have been consumed
    expect(engine.bodies.find(b => b.id === 'doom-1')).toBeUndefined();
    // impact strength is consumable then resets to zero
    const strength = engine.consumeImpactStrength();
    expect(strength).toBeGreaterThan(0);
    expect(engine.consumeImpactStrength()).toBe(0);
  });

  it('does not shatter bodies when Roche breaking is disabled', () => {
    const engine = new SimulationEngine([star()], { enableCollisions: true });
    engine.enableRocheBreaking = false;
    // wide orbit well outside the rigid Roche regime — control group
    const far: CelestialBody = {
      id: 'far-1', name: 'Far', type: 'planet', massKg: EARTH_MASS_KG, radiusKm: 6371,
      position: { x: 1.2e8, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 42 }, color: '#88aaff',
    };
    engine.addBody(far);
    const catastrophes: ConsequenceEvent[] = [];
    engine.onCatastrophe = (ev) => catastrophes.push(ev);
    for (let i = 0; i < 4; i++) engine.stepOnce();
    expect(engine.bodies.find(b => b.id === 'far-1')).toBeDefined();
    expect(catastrophes.length).toBe(0);
  });

  it('never emits NaN positions even under degenerate twin superimposed bodies', () => {
    const twin: CelestialBody = {
      id: 'twin', name: 'Twin', type: 'star', massKg: 1, radiusKm: 1,
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#fff',
    };
    const engine = new SimulationEngine([twin], { enableCollisions: false });
    engine.update(1 / 60);
    for (const b of engine.bodies) {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.velocity.x)).toBe(true);
    }
  });

  it('ledger stays bounded regardless of catastrophe spam', () => {
    const engine = new SimulationEngine([star()], { enableCollisions: true });
    for (let i = 0; i < 900; i++) {
      engine.pushEvent({
        timestampSec: i, type: 'body_created', title: `evt ${i}`,
        description: 'spam', bodyIds: [], severity: 'info',
      });
    }
    expect(engine.events.length).toBeLessThanOrEqual(600);
    // oldest entries were evicted in write order — the ledger is a bounded ring
    expect(engine.events.some(e => e.title === 'evt 0')).toBe(false);
    expect(engine.events.some(e => e.title === 'evt 899')).toBe(true);
  });
});
