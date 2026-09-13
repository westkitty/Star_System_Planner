import { describe, it, expect } from 'vitest';
import { CelestialBody } from '../simulation/types';
import { G_KM, SOLAR_MASS_KG, KM_PER_AU, EARTH_MASS_KG } from '../simulation/units';
import { createId } from '../core/id';
import { toUserMessage, toErrorCode, PlannerError } from '../core/errors';
import { SnapshotBuffer } from '../simulation/snapshot-buffer';
import { planHohmann, applyTransferDeparture } from '../simulation/transfer-planner';
import { mergeBodiesInelastic } from '../simulation/collisions';
import { sampleEphemeris, ephemerisToCsv } from '../simulation/ephemeris';
import { ContractTracker, CONTRACT_DEFINITIONS } from '../simulation/contracts';
import { AssistTracker } from '../simulation/gravity-assists';
import { divergencePercent } from '../branching/branch-manager';
import {
  registerCommands,
  unregisterCommand,
  searchCommands,
  clearCommandsForTests,
} from '../ui/command-registry';
import { shouldShowCoachmark, dismissCoachmark, COACHMARK_COPY } from '../ui/coachmarks';
import { checkPendingRecovery, markSessionDirty, clearPendingRecovery } from '../core/recovery';
import { assessHabitability } from '../simulation/habitability';

function makeStar(): CelestialBody {
  return {
    id: 'star-t2',
    name: 'Sol Test',
    type: 'star',
    massKg: SOLAR_MASS_KG,
    radiusKm: 696340,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fixed: true,
    color: '#ffd700',
  };
}

function makePlanet(id: string, radiusKm: number, massKg = EARTH_MASS_KG): CelestialBody {
  const v = Math.sqrt((G_KM * SOLAR_MASS_KG) / radiusKm);
  return {
    id,
    name: id,
    type: 'planet',
    massKg,
    radiusKm: 6371,
    primaryId: 'star-t2',
    position: { x: radiusKm, y: 0, z: 0 },
    velocity: { x: 0, y: v, z: 0 },
    color: '#2277ff',
  };
}

describe('Unique ids (BACK06)', () => {
  it('prefixes and never repeats within a burst', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = createId('test');
      expect(id.startsWith('test-')).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
  });
});

describe('Error taxonomy (BACK07)', () => {
  it('passes PlannerError user copy through with its subsystem code', () => {
    const err = new PlannerError('PERSIST_WRITE', 'Could not save — storage is full.');
    expect(toUserMessage(err)).toContain('storage is full');
    expect(toErrorCode(err)).toBe('PERSIST_WRITE');
  });

  it('falls back gracefully for untyped throws', () => {
    expect(toUserMessage(new Error('kaboom'))).toContain('kaboom');
    expect(toUserMessage('plain string')).toBe('Unexpected error');
    expect(toUserMessage(null)).toBe('Unexpected error');
    expect(toErrorCode(null)).toBe('UNKNOWN');
  });
});

describe('SnapshotBuffer time scrub (UI03/BACK02)', () => {
  it('records only when the interval elapses', () => {
    const buf = new SnapshotBuffer(10, 5);
    const bodies = [makeStar()];
    expect(buf.recordIfDue(0, bodies)).toBe(true);
    expect(buf.recordIfDue(2, bodies)).toBe(false);
    expect(buf.recordIfDue(5, bodies)).toBe(true);
    expect(buf.size).toBe(2);
  });

  it('evicts oldest entries past capacity and finds nearest snapshots', () => {
    const buf = new SnapshotBuffer(3, 1);
    const bodies = [makeStar()];
    for (let t = 0; t < 5; t++) buf.recordIfDue(t, bodies);
    expect(buf.size).toBe(3);
    expect(buf.oldestTimeSec()).toBe(2);
    expect(buf.nearestAtOrBefore(3)?.timeSec).toBe(3);
    expect(buf.at(99)).toBeNull();
  });
});

describe('Hohmann transfer planner (GAME01)', () => {
  it('plans a 1 AU → 1.5 AU raising transfer with sane Δv', () => {
    const star = makeStar();
    const ship = makePlanet('ship', KM_PER_AU, 1000);
    const plan = planHohmann(ship, star, 1.5 * KM_PER_AU);
    expect(plan).not.toBeNull();
    expect(plan!.raising).toBe(true);
    expect(plan!.dv1KmS).toBeGreaterThan(2);
    expect(plan!.dv1KmS).toBeLessThan(4);
    expect(plan!.totalDvKmS).toBeCloseTo(plan!.dv1KmS + plan!.dv2KmS, 9);
    expect(plan!.transferTimeSec).toBeGreaterThan(86400 * 30);
  });

  it('rejects degenerate targets and applies departure burns', () => {
    const star = makeStar();
    const ship = makePlanet('ship', KM_PER_AU, 1000);
    expect(planHohmann(ship, star, -5)).toBeNull();
    const plan = planHohmann(ship, star, 1.5 * KM_PER_AU)!;
    const before = Math.hypot(ship.velocity.x, ship.velocity.y, ship.velocity.z);
    const result = applyTransferDeparture(ship, star, plan);
    expect(result.applied).toBe(true);
    const after = Math.hypot(ship.velocity.x, ship.velocity.y, ship.velocity.z);
    expect(after - before).toBeCloseTo(plan.dv1KmS, 6);
  });
});

describe('Inelastic manual merge (GAME10)', () => {
  it('conserves mass and keeps the heavier survivor', () => {
    const a = makePlanet('heavy', KM_PER_AU, 6e24);
    const b = makePlanet('light', KM_PER_AU * 1.001, 2e24);
    b.velocity = { x: 0, y: 25, z: 0 };
    const result = mergeBodiesInelastic(a, b, 1000);
    expect(result.survivor.id).toBe('heavy');
    expect(result.absorbedId).toBe('light');
    expect(result.survivor.massKg).toBeCloseTo(8e24, 12);
    expect(result.event.type).toBe('collision');
    expect(result.event.bodyIds).toContain('heavy');
  });
});

describe('Ephemeris export (BACK12)', () => {
  it('samples trajectories and renders CSV rows', () => {
    const bodies = [makeStar(), makePlanet('p', KM_PER_AU)];
    const samples = sampleEphemeris(bodies, 12, 3600);
    expect(samples).toHaveLength(13); // t=0 plus 12 steps
    expect(samples[0].bodies).toHaveLength(2);
    const csv = ephemerisToCsv(samples);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('t_s,body_id,body_name,x_km,y_km,z_km');
    expect(lines.length).toBe(1 + 13 * 2);
  });
});

describe('Scenario contracts (MissionsPanel)', () => {
  it('fulfils Comet Shepherd from captured-body context', () => {
    const tracker = new ContractTracker();
    const bodies = [makeStar(), makePlanet('wanderer', KM_PER_AU * 2)];
    const fresh = tracker.evaluate(bodies, { capturedBodyIds: ['wanderer'] });
    expect(fresh.map((d) => d.id)).toContain('comet-shepherd');
    expect(tracker.isComplete('comet-shepherd')).toBe(true);
    const progress = tracker.progressOf(CONTRACT_DEFINITIONS[2], bodies, { capturedBodyIds: [] });
    expect(progress.done).toBe(true); // completion persists across contexts
    tracker.resetAll();
    expect(tracker.isComplete('comet-shepherd')).toBe(false);
  });

  it('reports honest in-progress copy when nothing is fulfilled', () => {
    const tracker = new ContractTracker();
    const bodies = [makeStar(), makePlanet('p', KM_PER_AU)];
    const fresh = tracker.evaluate(bodies, {});
    expect(fresh.map((d) => d.id)).not.toContain('comet-shepherd');
    const def = CONTRACT_DEFINITIONS.find((d) => d.id === 'comet-shepherd')!;
    expect(tracker.progressOf(def, bodies, {}).done).toBe(false);
  });
});

describe('Gravity-assist meter (GAME07)', () => {
  it('stays silent for distant, unperturbed bodies', () => {
    const tracker = new AssistTracker();
    const bodies = [makeStar(), makePlanet('far', KM_PER_AU * 5)];
    expect(tracker.update(bodies, 0)).toHaveLength(0);
    expect(tracker.update(bodies, 1000)).toHaveLength(0);
    expect(tracker.best.deltaVKmS).toBe(0);
  });
});

describe('Branch divergence (GAME14)', () => {
  it('scores identical branches at zero and AU-scale drift near 100', () => {
    const a = [makeStar(), makePlanet('p', KM_PER_AU)];
    const same = [makeStar(), makePlanet('p', KM_PER_AU)];
    expect(divergencePercent(a, same)).toBe(0);
    const drifted = [makeStar(), makePlanet('p', KM_PER_AU)];
    drifted[1].position.x += KM_PER_AU;
    expect(divergencePercent(a, drifted)).toBeGreaterThan(40);
    expect(divergencePercent(a, drifted)).toBeLessThanOrEqual(100);
  });

  it('returns full divergence for disjoint branch censuses', () => {
    const a = [makeStar()];
    const otherStar = makeStar();
    otherStar.id = 'other-star';
    expect(divergencePercent(a, [otherStar])).toBe(100);
    expect(divergencePercent([], [otherStar])).toBe(0);
  });
});

describe('Command palette registry (UI01)', () => {
  it('registers, fuzzy-searches, and unregisters commands', () => {
    clearCommandsForTests();
    registerCommands([
      { id: 't-pause', title: 'Pause time', section: 'Transport', run: () => {} },
      { id: 't-fork', title: 'Fork timeline', section: 'System', run: () => {} },
    ]);
    expect(searchCommands('fork').map((c) => c.id)).toContain('t-fork');
    expect(searchCommands('xyz-no-match')).toHaveLength(0);
    unregisterCommand('t-fork');
    expect(searchCommands('fork')).toHaveLength(0);
    clearCommandsForTests();
  });
});

describe('Coachmarks (UI13)', () => {
  it('ships copy for every trigger and never throws headless', () => {
    for (const id of ['grab', 'loom', 'fork', 'macro', 'transfer'] as const) {
      expect(COACHMARK_COPY[id].title.length).toBeGreaterThan(0);
      expect(shouldShowCoachmark(id)).toBe(true);
      expect(() => dismissCoachmark(id)).not.toThrow();
    }
  });
});

describe('Crash recovery flags (BACK08)', () => {
  it('round-trips dirty/clean without a DOM', () => {
    clearPendingRecovery();
    expect(checkPendingRecovery()).toBeNull();
    markSessionDirty();
    const pending = checkPendingRecovery();
    expect(pending).not.toBeNull();
    expect(typeof pending!.dirtyAtIso).toBe('string');
    clearPendingRecovery();
    expect(checkPendingRecovery()).toBeNull();
  });
});

describe('Habitability assessment (GAME08)', () => {
  it('scores an Earth-like world above a Mercury-like scorcher', () => {
    const star = makeStar();
    const earth = makePlanet('earth-like', KM_PER_AU);
    earth.radiusKm = 6371;
    earth.massKg = EARTH_MASS_KG;
    const scorcher = makePlanet('scorcher', KM_PER_AU * 0.15);
    const bodies = [star, earth, scorcher];
    const good = assessHabitability(earth, bodies);
    const bad = assessHabitability(scorcher, bodies);
    expect(good).not.toBeNull();
    expect(bad).not.toBeNull();
    expect(good!.score).toBeGreaterThan(bad!.score);
    expect(good!.score).toBeGreaterThanOrEqual(0);
    expect(good!.score).toBeLessThanOrEqual(100);
  });
});
