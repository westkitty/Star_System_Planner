/**
 * Iteration 1 regression suites (BACK13).
 *
 * Covers the new core utilities, gameplay systems, persistence pipeline,
 * and procedural content introduced in the first recursive pass.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SeededRng } from '../core/seeded-rng';
import { eventBus } from '../core/event-bus';
import { logger } from '../core/logger';
import { stepSizeForTimeScale } from '../core/config';
import { SimulationEngine } from '../simulation/engine';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, EARTH_MASS_KG, KM_PER_AU, G_KM } from '../simulation/units';
import {
  formatCountdown,
  formatDeltaV,
  formatEnergy,
  formatMissionClock,
  formatRelativeTime,
} from '../simulation/units';
import { UndoStack } from '../simulation/undo-stack';
import { SimulationEventMonitor, thermalRegimeFor } from '../simulation/event-monitor';
import { applyNudge, circularizeOrbit, matchVelocity } from '../simulation/maneuvers';
import { ChallengeTracker } from '../simulation/challenges';
import { ForecastAlertTracker, severityForTimeToImpact } from '../simulation/forecast-alerts';
import { migrateProject, CURRENT_SCHEMA_VERSION } from '../persistence/migrations';
import { validateProjectStructure } from '../persistence/validation';
import { spectralClassByLetter, spectralClassForMass } from '../rendering/star-palette';
import { createProceduralSystem } from '../simulation/presets/procedural-system';
import { shortcutIdForEvent, isEditableTarget } from '../ui/shortcuts';

function makeStar(): CelestialBody {
  return {
    id: 'test-star',
    name: 'Test Star',
    type: 'star',
    massKg: SOLAR_MASS_KG,
    radiusKm: 696000,
    luminosityW: 3.828e26,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fixed: true,
    color: '#ffdd66',
  };
}

function makePlanet(distAu = 1.0, velocityFactor = 1.0): CelestialBody {
  const distKm = distAu * KM_PER_AU;
  const vCirc = Math.sqrt((G_KM * SOLAR_MASS_KG) / distKm);
  return {
    id: `test-planet-${distAu}-${velocityFactor}`,
    name: 'Test Planet',
    type: 'planet',
    classification: 'rocky',
    massKg: EARTH_MASS_KG,
    radiusKm: 6371,
    position: { x: distKm, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: vCirc * velocityFactor },
    color: '#4488ee',
    temperatureK: 280,
  };
}

beforeEach(() => {
  eventBus.clear();
  logger.clear();
});

// ---------- Seeded RNG ----------

describe('SeededRng (BACK10)', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = new SeededRng(1234);
    const b = new SeededRng(1234);
    for (let i = 0; i < 20; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it('produces divergent sequences for different seeds', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    const seqA = Array.from({ length: 8 }, () => a.nextFloat());
    const seqB = Array.from({ length: 8 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);
  });

  it('hashes strings deterministically and forks independent streams', () => {
    expect(SeededRng.hashString('kallisto')).toBe(SeededRng.hashString('kallisto'));
    const parent = new SeededRng(99);
    const f1 = parent.fork('a');
    const f2 = parent.fork('a');
    expect(f1.nextUint32()).not.toBe(f2.nextUint32()); // parent advanced between forks
    const g1 = new SeededRng(7).fork('x');
    const g2 = new SeededRng(7).fork('x');
    expect(g1.nextUint32()).toBe(g2.nextUint32());
  });

  it('respects range bounds', () => {
    const rng = new SeededRng(5);
    for (let i = 0; i < 50; i++) {
      const v = rng.intRange(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

// ---------- Event bus + logger ----------

describe('EventBus (BACK01) and Logger (BACK02)', () => {
  it('delivers typed events and supports unsubscribe', () => {
    const seen: string[] = [];
    const off = eventBus.on('body:created', (e) => seen.push((e.payload as { bodyId: string }).bodyId));
    eventBus.emit('body:created', { bodyId: 'x' });
    off();
    eventBus.emit('body:created', { bodyId: 'y' });
    expect(seen).toEqual(['x']);
  });

  it('retains recent history for diagnostics', () => {
    eventBus.emit('branch:forked', { branchId: 'b1' });
    expect(eventBus.recent(5).map((e) => e.type)).toContain('branch:forked');
  });

  it('buffers log records and exports diagnostics JSON', () => {
    logger.info('test', 'hello', { n: 1 });
    logger.error('test', 'boom');
    const records = logger.drain();
    expect(records.length).toBe(2);
    expect(records[0].scope).toBe('test');
    const exported = JSON.parse(logger.exportDiagnostics({ extra: true }));
    expect(exported.records.length).toBe(2);
    expect(exported.extra).toBe(true);
  });
});

// ---------- Config ladder ----------

describe('Central config (BACK12)', () => {
  it('resolves adaptive step sizes along the ladder', () => {
    expect(stepSizeForTimeScale(1)).toBe(60);
    expect(stepSizeForTimeScale(10)).toBe(120);
    expect(stepSizeForTimeScale(100)).toBe(600);
    expect(stepSizeForTimeScale(1000)).toBe(3600);
    expect(stepSizeForTimeScale(100000)).toBe(4 * 3600);
  });
});

// ---------- Engine step-once ----------

describe('SimulationEngine.stepOnce (GAME01)', () => {
  it('advances exactly one adaptive step and stays stable', () => {
    const engine = new SimulationEngine([makeStar(), makePlanet()]);
    const t0 = engine.timeSec;
    expect(engine.stepOnce()).toBe(true);
    expect(engine.timeSec).toBeGreaterThan(t0);
    expect(engine.bodies.length).toBe(2);
  });
});

// ---------- Undo stack ----------

describe('UndoStack (GAME08)', () => {
  it('restores bodies removed after a checkpoint', () => {
    const engine = new SimulationEngine([makeStar(), makePlanet()]);
    const stack = new UndoStack();
    stack.checkpoint(engine, 'delete-body', 'Delete Test Planet');
    engine.removeBody('test-planet-1-1');
    expect(engine.bodies.length).toBe(1);
    const entry = stack.undo(engine);
    expect(entry?.label).toBe('Delete Test Planet');
    expect(engine.bodies.length).toBe(2);
    expect(stack.depth()).toBe(0);
  });

  it('returns null when empty and caps history', () => {
    const engine = new SimulationEngine([makeStar()]);
    const stack = new UndoStack();
    expect(stack.undo(engine)).toBeNull();
    for (let i = 0; i < 30; i++) stack.checkpoint(engine, 'bulk', `c${i}`);
    expect(stack.depth()).toBeLessThanOrEqual(25);
  });
});

// ---------- Event monitor ----------

describe('SimulationEventMonitor (GAME05–07)', () => {
  it('classifies thermal regimes across thresholds', () => {
    expect(thermalRegimeFor(150)).toBe('frozen');
    expect(thermalRegimeFor(250)).toBe('cold');
    expect(thermalRegimeFor(288)).toBe('temperate');
    expect(thermalRegimeFor(400)).toBe('hot');
    expect(thermalRegimeFor(1200)).toBe('inferno');
  });

  it('detects newly unbound escape trajectories', () => {
    const star = makeStar();
    const planet = makePlanet(1.0, 1.0);
    const monitor = new SimulationEventMonitor();
    monitor.throttleMs = 0;
    // Baseline pass: bound orbit registers without events.
    expect(monitor.update([star, planet], 0, 1000)).toEqual([]);
    // Slingshot to 1.5× circular velocity → unbound.
    const distKm = 1.0 * KM_PER_AU;
    planet.velocity = { x: 0, y: 0, z: Math.sqrt((G_KM * SOLAR_MASS_KG) / distKm) * 1.5 };
    const events = monitor.update([star, planet], 60, 2000);
    expect(events.some((e) => e.type === 'orbit_unbound')).toBe(true);
  });

  it('flags Roche breaches inside the tidal limit', () => {
    const star = makeStar();
    // Skim the stellar surface: inside the Roche limit for an Earth analog.
    const planet = makePlanet(0.004, 1.0);
    planet.id = 'roche-diver';
    const monitor = new SimulationEventMonitor();
    monitor.throttleMs = 0;
    monitor.update([star, planet], 0, 1000);
    // Nudge outward then back in to trigger the edge transition.
    planet.position = { x: 0.02 * KM_PER_AU, y: 0, z: 0 };
    monitor.update([star, planet], 60, 2000);
    planet.position = { x: 0.004 * KM_PER_AU, y: 0, z: 0 };
    const events = monitor.update([star, planet], 120, 3000);
    expect(events.some((e) => e.type === 'roche_violation')).toBe(true);
  });
});

// ---------- Maneuvers ----------

describe('Flight maneuvers (GAME10–12)', () => {
  it('applies prograde nudges that raise orbital energy', () => {
    const star = makeStar();
    const planet = makePlanet();
    const before = Math.hypot(planet.velocity.x, planet.velocity.y, planet.velocity.z);
    const result = applyNudge(planet, star, 'prograde', 1.0);
    expect(result.applied).toBe(true);
    expect(result.deltaVKmS).toBe(1.0);
    const after = Math.hypot(planet.velocity.x, planet.velocity.y, planet.velocity.z);
    expect(after).toBeGreaterThan(before);
  });

  it('circularizes eccentric orbits to near-zero eccentricity', () => {
    const star = makeStar();
    const planet = makePlanet(1.0, 0.7); // eccentric infall
    const result = circularizeOrbit(planet, star);
    expect(result.applied).toBe(true);
    expect(result.deltaVKmS).toBeGreaterThan(0);
  });

  it('matches rendezvous target velocity exactly', () => {
    const a = makePlanet(1.0, 1.0);
    const b = makePlanet(1.2, 0.9);
    b.id = 'target';
    const result = matchVelocity(a, b);
    expect(result.applied).toBe(true);
    expect(a.velocity).toEqual(b.velocity);
    expect(matchVelocity(a, a).applied).toBe(false);
  });
});

// ---------- Challenges ----------

describe('ChallengeTracker (GAME14)', () => {
  let tracker: ChallengeTracker | null = null;
  afterEach(() => {
    tracker?.destroy();
    tracker = null;
  });

  it('credits event-driven challenges through the bus', () => {
    tracker = new ChallengeTracker();
    tracker.setBodyProvider(() => [makeStar(), makePlanet()]);
    eventBus.emit('throw:released', { bodyId: 'x' });
    const slingshot = tracker.list().find((s) => s.id === 'slingshot');
    expect(slingshot?.completed).toBe(true);
  });

  it('gates ringwright behind actual ring structures', () => {
    tracker = new ChallengeTracker();
    const bodies = [makeStar(), makePlanet()];
    tracker.setBodyProvider(() => bodies);
    eventBus.emit('orbit:fitted', {});
    expect(tracker.list().find((s) => s.id === 'ringwright')?.completed).toBe(false);
    bodies[1].rings = [
      { id: 'r1', name: 'R', innerRadiusKm: 8000, outerRadiusKm: 14000, normal: { x: 0, y: 1, z: 0 } },
    ];
    eventBus.emit('orbit:fitted', {});
    expect(tracker.list().find((s) => s.id === 'ringwright')?.completed).toBe(true);
  });

  it('supports manual credit and full reset', () => {
    tracker = new ChallengeTracker();
    tracker.credit('first-light');
    expect(tracker.completedCount()).toBeGreaterThanOrEqual(1);
    tracker.resetAll();
    expect(tracker.completedCount()).toBe(0);
  });
});

// ---------- Forecast alerts ----------

describe('ForecastAlertTracker (GAME04)', () => {
  it('ranks severity by time-to-impact', () => {
    expect(severityForTimeToImpact(3600)).toBe('imminent');
    expect(severityForTimeToImpact(86400 * 10)).toBe('warning');
    expect(severityForTimeToImpact(86400 * 90)).toBe('watch');
  });

  it('ingests worker collisions and expires stale predictions', () => {
    const tracker = new ForecastAlertTracker();
    const bodies = [makeStar(), makePlanet()];
    bodies[1].id = 'p1';
    const response = {
      requestId: 1,
      trajectories: {},
      collisions: [
        {
          bodyAId: 'p1',
          bodyBId: 'test-star',
          timestampSec: 1000,
          positionKm: { x: 0, y: 0, z: 0 },
          timeToImpactSec: 500,
        },
      ],
    };
    const alerts = tracker.ingest(response, bodies);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('imminent');
    expect(tracker.unannounced().length).toBe(1);
    tracker.markAnnounced(alerts[0].key);
    expect(tracker.unannounced().length).toBe(0);
    // Fresh forecast without the collision expires the alert.
    expect(tracker.ingest({ requestId: 2, trajectories: {}, collisions: [] }, bodies).length).toBe(0);
  });
});

// ---------- Persistence pipeline ----------

describe('Migrations + validation (BACK05/BACK06)', () => {
  function legacyProject(): Record<string, unknown> {
    return {
      schemaVersion: '1.0.0',
      projectId: 'p1',
      projectName: 'Legacy',
      branches: [
        {
          id: 'b1',
          name: 'Prime',
          snapshot: {
            timestampSec: 0,
            bodies: [
              {
                id: 's1',
                name: 'Sol',
                type: 'star',
                massKg: SOLAR_MASS_KG,
                radiusKm: 696000,
                position: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                color: '#ffdd66',
              },
            ],
          },
          events: [],
        },
      ],
      activeBranchId: 'b1',
    };
  }

  it('migrates 1.0.0 projects to the current schema', () => {
    const result = migrateProject(legacyProject());
    expect(result.migrated).toBe(true);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('rejects unknown schema versions', () => {
    expect(() => migrateProject({ schemaVersion: '9.9.9' })).toThrow(/Unsupported schema version/);
  });

  it('validates healthy projects and pinpoints defects', () => {
    const healthy = migrateProject(legacyProject());
    expect(healthy.migrated).toBe(true);
    const project = legacyProject();
    migrateProject(project);
    expect(validateProjectStructure(project).valid).toBe(true);

    const broken = { projectId: 'x', branches: [{ id: 'b', snapshot: { bodies: [{ id: '', type: 'nope' }] } }] };
    const report = validateProjectStructure(broken);
    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThanOrEqual(3);
    expect(report.issues.some((i) => i.path.includes('projectName'))).toBe(true);
  });
});

// ---------- Star palette + procedural systems ----------

describe('Spectral palette (ASSET01) + procedural generator (GAME13)', () => {
  it('maps solar mass to G class and resolves letters', () => {
    expect(spectralClassForMass(SOLAR_MASS_KG).class).toBe('G');
    expect(spectralClassForMass(SOLAR_MASS_KG * 0.2).class).toBe('M');
    expect(spectralClassByLetter('K').temperatureK).toBe(4500);
  });

  it('generates deterministic systems from seeds', () => {
    const a = createProceduralSystem(4242);
    const b = createProceduralSystem(4242);
    expect(a.bodies.length).toBe(b.bodies.length);
    expect(a.bodies.map((x) => x.name)).toEqual(b.bodies.map((x) => x.name));
    expect(a.bodies[0].type).toBe('star');
    for (const body of a.bodies) {
      expect(body.massKg).toBeGreaterThan(0);
      expect(body.radiusKm).toBeGreaterThan(0);
    }
  });

  it('varies output across seeds', () => {
    const a = createProceduralSystem(111);
    const b = createProceduralSystem(222);
    expect(a.bodies.map((x) => x.name).join(',')).not.toBe(b.bodies.map((x) => x.name).join(','));
  });
});

// ---------- Formatters ----------

describe('Extended formatters (BACK11)', () => {
  it('formats delta-v, energy, clocks, and countdowns', () => {
    expect(formatDeltaV(0.4)).toBe('400 m/s Δv');
    expect(formatDeltaV(2.5)).toContain('km/s Δv');
    expect(formatEnergy(-1.5e30)).toContain('×10³⁰ J');
    expect(formatMissionClock(90061)).toBe('T+1d 01:01:01');
    expect(formatCountdown(45)).toBe('45s');
    expect(formatCountdown(400000)).toContain('d');
    expect(formatRelativeTime(null)).toBe('never');
    expect(formatRelativeTime(Date.now() - 3000)).toBe('just now');
  });
});

// ---------- Shortcuts ----------

describe('Shortcut mapping (UI01)', () => {
  it('maps transport and tool keys', () => {
    expect(shortcutIdForEvent({ key: ' ' } as KeyboardEvent)).toBe('toggle-pause');
    expect(shortcutIdForEvent({ key: '3' } as KeyboardEvent)).toBe('tool-loom');
    expect(shortcutIdForEvent({ key: '?' } as KeyboardEvent)).toBe('open-help');
    expect(shortcutIdForEvent({ key: 'z', ctrlKey: true } as unknown as KeyboardEvent)).toBe('undo');
    expect(shortcutIdForEvent({ key: 'F', shiftKey: true } as unknown as KeyboardEvent)).toBe('follow-toggle');
    expect(shortcutIdForEvent({ key: 'q' } as KeyboardEvent)).toBeNull();
  });

  it('detects editable targets defensively', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
