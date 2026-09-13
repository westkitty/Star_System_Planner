/**
 * Iteration 3 regression suite: coherence, consequence, craft.
 *
 * Covers the verifiable core of all 60 iteration-3 improvements:
 * shortcut coherence, palette recency, settings density, spawn validation,
 * trojan/arrival planners, debrief/codex/architect progression, typed bus
 * contracts, import diagnostics, disposal/monitor/load hardening, and the
 * deterministic utilities underneath them.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine, normalizeTimeScale, MIN_TIME_SCALE, MAX_TIME_SCALE } from '../simulation/engine';
import { BranchManager } from '../branching/branch-manager';
import { UndoStack } from '../simulation/undo-stack';
import { SimulationEventMonitor } from '../simulation/event-monitor';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG, EARTH_MASS_KG, KM_PER_AU, G_KM } from '../simulation/units';
import { planTrojanPair } from '../simulation/orbital-mechanics';
import { planArrivalBurn, applyArrivalBurn, ARRIVAL_WINDOW_FRACTION } from '../simulation/transfer-planner';
import { ChallengeTracker, CHALLENGE_DEFINITIONS, TIER_ORDER } from '../simulation/challenges';
import { ContractTracker, CONTRACT_DEFINITIONS } from '../simulation/contracts';
import { DiscoveryCodex, DISCOVERY_KINDS } from '../simulation/discovery-codex';
import { computeArchitectScore, bandForScore } from '../simulation/architect-score';
import { eventBus } from '../core/event-bus';
import { createId, resetIdCounterForTests } from '../core/id';
import { SeededRng } from '../core/seeded-rng';
import { migrateSettings, DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../core/settings';
import { collectDiagnostics } from '../core/diagnostics';
import { disposalRegistry } from '../rendering/disposal';
import { orbitLineStyle } from '../rendering/orbit-lines';
import { spectralClassByLetter, spectralClassForMass } from '../rendering/star-palette';
import { buildStationKit } from '../rendering/station-kit';
import { coronaGradeForLetter } from '../rendering/sprite-assets';
import { impactEnergyJoules, formatImpactEnergy } from '../simulation/collisions';
import { logDeltaV } from '../simulation/maneuvers';
import { validatePlannerConfig } from '../core/config';
import { logger } from '../core/logger';
import { validateSpawnInputs } from '../ui/CreateBodyModal';
import {
  registerCommands,
  searchCommands,
  recordCommandUse,
  getRecentIds,
  clearCommandsForTests,
  clearRecentForTests,
} from '../ui/command-registry';
import { shortcutHintFor, shortcutIdForEvent, isEditableTarget } from '../ui/shortcuts';
import { toastDedupeKey, shouldCoalesceToast, TOAST_DEDUPE_WINDOW_MS } from '../ui/toast';
import { parseProjectWithDiagnostics, exportProjectToJson } from '../persistence/export-import';
import { createSerializableProject } from '../persistence/serializer';

function makeStar(): CelestialBody {
  return {
    id: 'star-1',
    name: 'Sol',
    type: 'star',
    massKg: SOLAR_MASS_KG,
    radiusKm: 696000,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    color: '#ffdd66',
  };
}

function makePlanet(star: CelestialBody): CelestialBody {
  const v = Math.sqrt((G_KM * star.massKg) / KM_PER_AU);
  return {
    id: 'planet-1',
    name: 'Terra',
    type: 'planet',
    massKg: EARTH_MASS_KG,
    radiusKm: 6371,
    position: { x: KM_PER_AU, y: 0, z: 0 },
    velocity: { x: 0, y: v, z: 0 },
    color: '#1b64b3',
    primaryId: star.id,
  };
}

describe('UI01/UI07 shortcut coherence', () => {
  it('exposes live hints for remapped commands', () => {
    expect(shortcutHintFor('tool-create')).toBe('N');
    expect(shortcutHintFor('faster')).toBe('+');
    expect(shortcutHintFor('slower')).toBe('−');
    expect(shortcutHintFor('no-such-command')).toBeUndefined();
  });

  it('routes Alt+Arrow keys to selection history', () => {
    expect(shortcutIdForEvent({ key: 'ArrowLeft', altKey: true } as KeyboardEvent)).toBe('selection-back');
    expect(shortcutIdForEvent({ key: 'ArrowRight', altKey: true } as KeyboardEvent)).toBe('selection-forward');
    expect(shortcutIdForEvent({ key: 'N' } as KeyboardEvent)).toBe('tool-create');
    expect(shortcutIdForEvent({ key: 'F1' } as KeyboardEvent)).toBeNull();
  });

  it('ignores shortcuts from editable targets', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('UI02 palette recency', () => {
  beforeEach(() => {
    clearCommandsForTests();
    clearRecentForTests();
  });

  it('tracks most-recent-first command usage', () => {
    registerCommands([
      { id: 'alpha', title: 'Alpha', section: 'System', run: () => undefined },
      { id: 'beta', title: 'Beta', section: 'System', run: () => undefined },
    ]);
    recordCommandUse('beta');
    expect(getRecentIds()).toEqual(['beta']);
    recordCommandUse('alpha');
    expect(getRecentIds()).toEqual(['alpha', 'beta']);
    recordCommandUse('beta');
    expect(getRecentIds()).toEqual(['beta', 'alpha']);
  });

  it('floats recent commands to the top of empty searches', () => {
    registerCommands([
      { id: 'alpha', title: 'Alpha', section: 'System', run: () => undefined },
      { id: 'beta', title: 'Beta', section: 'System', run: () => undefined },
    ]);
    recordCommandUse('beta');
    expect(searchCommands('')[0].id).toBe('beta');
    expect(searchCommands('zzz-no-match')).toEqual([]);
  });
});

describe('UI06 settings density', () => {
  it('defaults to comfortable and preserves compact', () => {
    expect(DEFAULT_SETTINGS.hudDensity).toBe('comfortable');
    expect(migrateSettings({}).hudDensity).toBe('comfortable');
    expect(migrateSettings({ hudDensity: 'compact' }).hudDensity).toBe('compact');
    expect(migrateSettings({}).settingsVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });
});

describe('UI09 toast coalescing', () => {
  it('builds distinct keys per title+detail', () => {
    expect(toastDedupeKey('a', 'b')).not.toBe(toastDedupeKey('a', 'c'));
    expect(toastDedupeKey('a')).toBe(toastDedupeKey('a'));
  });

  it('coalesces only inside the window', () => {
    expect(shouldCoalesceToast(1000, 1000 + TOAST_DEDUPE_WINDOW_MS)).toBe(true);
    expect(shouldCoalesceToast(1000, 1000 + TOAST_DEDUPE_WINDOW_MS + 1)).toBe(false);
    expect(shouldCoalesceToast(2000, 1000)).toBe(false);
  });
});

describe('UI12 spawn validation', () => {
  it('blocks empty names and unreachable distances', () => {
    const star = makeStar();
    expect(validateSpawnInputs('', 1, star, [star]).errors.length).toBeGreaterThan(0);
    expect(validateSpawnInputs('   ', 1, star, [star]).errors.length).toBeGreaterThan(0);
    expect(validateSpawnInputs('Far', 500, star, [star]).errors.length).toBeGreaterThan(0);
    expect(validateSpawnInputs('Near', 0.01, star, [star]).errors.length).toBeGreaterThan(0);
  });

  it('passes clean spawns and warns on duplicates', () => {
    const star = makeStar();
    const bodies = [star, makePlanet(star)];
    expect(validateSpawnInputs('New Terra', 1, star, bodies).errors).toEqual([]);
    const dupe = validateSpawnInputs('terra', 1, star, bodies);
    expect(dupe.errors).toEqual([]);
    expect(dupe.warnings.length).toBeGreaterThan(0);
  });
});

describe('ASSET08 orbit styling', () => {
  it('grades line color by eccentricity and selection', () => {
    expect(orbitLineStyle(0.1, false).color).toBe('#3d7ea6');
    expect(orbitLineStyle(0.4, false).color).toBe('#7fb3c8');
    expect(orbitLineStyle(0.8, false).color).toBe('#e8a33d');
    expect(orbitLineStyle(0.1, true).color).toBe('#ffd166');
  });
});

describe('ASSET15 station variants', () => {
  it('builds every station variant headlessly', () => {
    for (const variant of ['station', 'ship', 'megastructure'] as const) {
      const kit = buildStationKit('#9fd8ff', variant);
      expect(kit.group).toBeDefined();
      expect(typeof kit.update).toBe('function');
    }
  });
});

describe('ASSET04 spectral classes', () => {
  it('resolves letters and solar masses', () => {
    expect(spectralClassByLetter('G').class).toBe('G');
    expect(spectralClassByLetter('M').class).toBe('M');
    expect(spectralClassForMass(SOLAR_MASS_KG).class).toBe('G');
    expect(spectralClassForMass(0.6 * SOLAR_MASS_KG).class).toBe('K');
  });
});

describe('GAME01/GAME05 grand-tour contract', () => {
  it('completes on three distinct worlds via the assist atlas', () => {
    const tracker = new ContractTracker();
    const def = CONTRACT_DEFINITIONS.find((d) => d.id === 'grand-tour');
    expect(def).toBeDefined();
    const craft: CelestialBody = {
      ...makePlanet(makeStar()),
      id: 'craft-1',
      name: 'Voyager',
      type: 'station',
    };
    const done = tracker.progressOf(def!, [craft], { assistAtlas: { 'craft-1': ['a', 'b', 'c'] } });
    expect(done.done).toBe(true);
    expect(done.progress).toContain('3 distinct worlds');
    const partial = tracker.progressOf(def!, [craft], { assistAtlas: { 'craft-1': ['a'] } });
    expect(partial.done).toBe(false);
    expect(partial.progress).toContain('1/3');
  });

  it('evaluates completions exactly once', () => {
    const tracker = new ContractTracker();
    const craft: CelestialBody = { ...makePlanet(makeStar()), id: 'craft-1', name: 'Voyager', type: 'station' };
    const ctx = { assistAtlas: { 'craft-1': ['a', 'b', 'c'] } };
    const first = tracker.evaluate([craft], ctx);
    expect(first.some((d) => d.id === 'grand-tour')).toBe(true);
    expect(tracker.evaluate([craft], ctx).some((d) => d.id === 'grand-tour')).toBe(false);
    expect(tracker.completedIds()).toContain('grand-tour');
  });
});

describe('GAME03 arrival burns', () => {
  it('opens the window at the destination radius', () => {
    const star = makeStar();
    const planet = makePlanet(star);
    expect(ARRIVAL_WINDOW_FRACTION).toBe(0.08);
    const plan = planArrivalBurn(planet, star, KM_PER_AU);
    expect(plan).not.toBeNull();
    expect(plan!.withinWindow).toBe(true);
    expect(plan!.dvKmS).toBeCloseTo(0, 1);
    expect(applyArrivalBurn(planet, star, plan!).applied).toBe(true);
  });

  it('rejects burns from outside the window', () => {
    const star = makeStar();
    const planet = makePlanet(star);
    const far = planArrivalBurn(planet, star, 5 * KM_PER_AU);
    expect(far).not.toBeNull();
    expect(far!.withinWindow).toBe(false);
    expect(applyArrivalBurn(planet, star, far!).applied).toBe(false);
    expect(planArrivalBurn(star, star, KM_PER_AU)).toBeNull();
  });
});

describe('GAME04 maneuver undo', () => {
  it('checkpoints and restores around maneuvers', () => {
    const star = makeStar();
    const engine = new SimulationEngine([star, makePlanet(star)]);
    const stack = new UndoStack();
    stack.checkpoint(engine, 'maneuver', 'test nudge');
    expect(stack.depth()).toBe(1);
    expect(stack.peek()?.kind).toBe('maneuver');
    engine.bodies.pop();
    expect(engine.bodies).toHaveLength(1);
    stack.undo(engine);
    expect(engine.bodies).toHaveLength(2);
    expect(stack.depth()).toBe(0);
  });
});

describe('GAME06 challenge tiers', () => {
  it('tiers every challenge including the eclipse photo', () => {
    expect(TIER_ORDER).toEqual(['Initiate', 'Architect', 'Master']);
    expect(CHALLENGE_DEFINITIONS.length).toBeGreaterThan(10);
    for (const def of CHALLENGE_DEFINITIONS) {
      expect(TIER_ORDER).toContain(def.tier);
    }
    const photo = CHALLENGE_DEFINITIONS.find((d) => d.id === 'eclipse-photo');
    expect(photo).toBeDefined();
    expect(photo!.tier).toBe('Master');
  });

  it('credits and resets challenges', () => {
    const tracker = new ChallengeTracker();
    try {
      expect(tracker.completedCount()).toBe(0);
      tracker.credit('first-light');
      expect(tracker.completedCount()).toBe(1);
      expect(tracker.list().find((s) => s.id === 'first-light')?.completed).toBe(true);
      tracker.credit('eclipse-photo');
      expect(tracker.completedCount()).toBe(2);
      tracker.resetAll();
      expect(tracker.completedCount()).toBe(0);
    } finally {
      tracker.destroy();
    }
  });
});

describe('GAME07 discovery codex', () => {
  it('collects sightings per kind', () => {
    const codex = new DiscoveryCodex();
    expect(DISCOVERY_KINDS).toHaveLength(6);
    codex.record('eclipse', 'Eclipse over Terra');
    codex.record('transit', 'Transit over Terra');
    codex.record('eclipse', 'Eclipse over Mars');
    expect(codex.kindsSeen()).toBe(2);
    expect(codex.totalSightings()).toBe(3);
    expect(codex.list().find((e) => e.kind === 'eclipse')?.count).toBe(2);
    codex.reset();
    expect(codex.totalSightings()).toBe(0);
    expect(codex.list()).toEqual([]);
  });
});

describe('GAME11 trojan pairs', () => {
  it('parks L4/L5 berths 120 degrees apart at the planet radius', () => {
    const star = makeStar();
    const planet = makePlanet(star);
    const pair = planTrojanPair(planet, star);
    expect(pair).not.toBeNull();
    const l4 = pair!.l4.position;
    const l5 = pair!.l5.position;
    for (const berth of [pair!.l4, pair!.l5]) {
      const d = Math.hypot(berth.position.x, berth.position.y, berth.position.z);
      expect(d / KM_PER_AU).toBeCloseTo(1, 2);
      expect(Number.isFinite(berth.velocity.x + berth.velocity.y + berth.velocity.z)).toBe(true);
    }
    const dot =
      (l4.x * l5.x + l4.y * l5.y + l4.z * l5.z) /
      (Math.hypot(l4.x, l4.y, l4.z) * Math.hypot(l5.x, l5.y, l5.z));
    expect(dot).toBeCloseTo(-0.5, 2);
  });

  it('refuses degenerate pairs', () => {
    const planet = makePlanet(makeStar());
    expect(planTrojanPair(planet, planet)).toBeNull();
  });
});

describe('GAME14 architect score', () => {
  it('grades the full journey from nascent to grand', () => {
    const max = computeArchitectScore({
      missionsDone: 18,
      missionsTotal: 18,
      contractsDone: 6,
      contractsTotal: 6,
      codexKinds: 6,
      codexSightings: 24,
      stabilityScore: 100,
    });
    expect(max.score).toBe(100);
    expect(max.band).toBe('Grand Architect');
    const zero = computeArchitectScore({
      missionsDone: 0,
      missionsTotal: 18,
      contractsDone: 0,
      contractsTotal: 6,
      codexKinds: 0,
      codexSightings: 0,
      stabilityScore: 0,
    });
    expect(zero.score).toBe(0);
    expect(zero.band).toBe('Nascent Architect');
    expect(bandForScore(90)).toBe('Grand Architect');
    expect(bandForScore(70)).toBe('Master Architect');
    expect(bandForScore(45)).toBe('Journeyman Architect');
    expect(bandForScore(44)).toBe('Nascent Architect');
  });
});

describe('BACK01 deterministic ids', () => {
  it('prefixes and uniquifies', () => {
    resetIdCounterForTests();
    const a = createId('proj');
    const b = createId('proj');
    expect(a.startsWith('proj-')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('BACK02 typed event contracts', () => {
  it('delivers typed payloads and keeps history', () => {
    eventBus.clear();
    let received = '';
    const unsub = eventBus.on('project:loaded', (e) => {
      received = e.payload.name;
    });
    eventBus.emit('project:loaded', { preset: 'p', name: 'n' });
    expect(received).toBe('n');
    unsub();
    eventBus.emit('project:loaded', { preset: 'p', name: 'ignored' });
    expect(received).toBe('n');
    expect(eventBus.recent(50).some((e) => e.type === 'project:loaded')).toBe(true);
  });
});

describe('BACK03 import diagnostics', () => {
  it('reports malformed and schema-invalid payloads', () => {
    const malformed = parseProjectWithDiagnostics('{not json');
    expect(malformed.ok).toBe(false);
    expect(malformed.project).toBeNull();
    expect(malformed.issues.length).toBeGreaterThan(0);
    const empty = parseProjectWithDiagnostics('{}');
    expect(empty.ok).toBe(false);
    expect(empty.issues.length).toBeGreaterThan(0);
  });

  it('round-trips a valid project cleanly', () => {
    const star = makeStar();
    const engine = new SimulationEngine([star, makePlanet(star)]);
    const mgr = new BranchManager(engine);
    const project = createSerializableProject(
      'Test Project',
      mgr,
      engine,
      { scaleMode: 'readable', showFuture: false, showSensitivity: false, showGravityGrid: false },
      { target: { x: 0, y: 0, z: 0 }, distance: 250, viewMode: 'inertial' }
    );
    const good = parseProjectWithDiagnostics(exportProjectToJson(project));
    expect(good.ok).toBe(true);
    expect(good.project?.projectName).toBe('Test Project');
    expect(good.issues).toEqual([]);
  });
});

describe('BACK07 monitor load shedding', () => {
  it('sheds pairs under budget pressure and reports load', () => {
    const star = makeStar();
    const bodies: CelestialBody[] = [star];
    for (let i = 0; i < 29; i++) {
      const angle = (i / 29) * Math.PI * 2;
      const v = Math.sqrt((G_KM * star.massKg) / KM_PER_AU);
      bodies.push({
        id: `planet-${i}`,
        name: `World ${i}`,
        type: 'planet',
        massKg: EARTH_MASS_KG,
        radiusKm: 5000,
        position: { x: Math.cos(angle) * KM_PER_AU, y: Math.sin(angle) * KM_PER_AU, z: 0 },
        velocity: { x: -Math.sin(angle) * v, y: Math.cos(angle) * v, z: 0 },
        color: '#888888',
        primaryId: star.id,
      });
    }
    const monitor = new SimulationEventMonitor();
    monitor.setPairBudget(10);
    expect(monitor.getLoadStats().budget).toBe(10);
    monitor.update(bodies, 0, 1000);
    const loaded = monitor.getLoadStats();
    expect(loaded.lastInput).toBe(30);
    expect(loaded.lastShed).toBeGreaterThan(0);
    monitor.setPairBudget(Number.POSITIVE_INFINITY);
    monitor.update(bodies, 1, 3000);
    expect(monitor.getLoadStats().lastShed).toBe(0);
  });
});

describe('BACK08 disposal registry', () => {
  it('tracks and releases GPU resources', () => {
    disposalRegistry.resetForTests();
    const res = { dispose: () => undefined };
    disposalRegistry.track(res, 'test-geo');
    expect(disposalRegistry.aliveCount()).toBe(1);
    expect(disposalRegistry.report().byTag['test-geo']).toBe(1);
    disposalRegistry.release(res);
    expect(disposalRegistry.aliveCount()).toBe(0);
    expect(disposalRegistry.report().alive).toBe(0);
  });
});

describe('GAME09 catastrophe checkpoints', () => {
  it('forks and checkpoints branches around catastrophes', () => {
    const star = makeStar();
    const engine = new SimulationEngine([star, makePlanet(star)]);
    const mgr = new BranchManager(engine);
    expect(mgr.getAllBranches()).toHaveLength(1);
    mgr.forkBranch('Alpha', engine);
    expect(mgr.getAllBranches()).toHaveLength(2);
    expect(() => mgr.checkpointActiveBranch(engine)).not.toThrow();
  });
});

describe('BACK14 time-scale safety', () => {
  it('clamps hostile scales at the engine boundary', () => {
    const engine = new SimulationEngine([]);
    expect(engine.setTimeScale(NaN)).toBe(MIN_TIME_SCALE);
    expect(engine.timeScale).toBe(1);
    expect(engine.setTimeScale(-100)).toBe(1);
    expect(engine.setTimeScale(1e9)).toBe(MAX_TIME_SCALE);
    expect(engine.setTimeScale(500)).toBe(500);
    expect(normalizeTimeScale(Number.POSITIVE_INFINITY)).toBe(MIN_TIME_SCALE);
    expect(MIN_TIME_SCALE).toBe(1);
    expect(MAX_TIME_SCALE).toBe(100000);
  });
});

describe('BACK15 diagnostics collector', () => {
  it('assembles the structured payload with safe defaults', () => {
    const d = collectDiagnostics({ projectName: 'Test', branchCount: 2, activeBranchId: 'b1' });
    expect(d.projectName).toBe('Test');
    expect((d.branches as { count: number }).count).toBe(2);
    expect(d.capabilities).toBeNull();
    expect(collectDiagnostics({}).projectName).toBe('unknown');
  });
});

describe('ASSET05 seeded backdrop', () => {
  it('hashes project names deterministically', () => {
    expect(SeededRng.hashString('Helios')).toBe(SeededRng.hashString('Helios'));
    expect(SeededRng.hashString('Helios')).not.toBe(SeededRng.hashString('Selene'));
    const a = new SeededRng(SeededRng.hashString('Helios'));
    const b = new SeededRng(SeededRng.hashString('Helios'));
    expect(a.nextFloat()).toBe(b.nextFloat());
  });
});

describe('ASSET04 corona grading', () => {
  it('grades giants hot and dwarfs dim', () => {
    expect(coronaGradeForLetter('O').size).toBeGreaterThan(coronaGradeForLetter('M').size);
    expect(coronaGradeForLetter('M').intensity).toBeLessThan(1);
    expect(coronaGradeForLetter('?')).toEqual(coronaGradeForLetter('G'));
  });
});

describe('GAME05 impact energetics', () => {
  it('reports merger energy in human units', () => {
    const e = impactEnergyJoules(5.972e24, 7.342e22, 12);
    expect(e).toBeGreaterThan(0);
    expect(formatImpactEnergy(e)).toContain('J');
    expect(formatImpactEnergy(2.5e18)).toContain('EJ');
    expect(formatImpactEnergy(NaN)).toBe('unknown energy');
  });
});

describe('GAME12 flown delta-v ledger', () => {
  it('accumulates spent delta-v on the hull', () => {
    const planet = makePlanet(makeStar());
    expect(planet.deltaVSpentKmS ?? 0).toBe(0);
    logDeltaV(planet, 1.5);
    logDeltaV(planet, 0.5);
    expect(planet.deltaVSpentKmS).toBeCloseTo(2, 6);
  });
});

describe('BACK09 boot guardrails', () => {
  it('accepts the shipped central tuning', () => {
    expect(validatePlannerConfig()).toEqual([]);
  });
});

describe('BACK10 session correlation', () => {
  it('tags every log line with a stable session id', () => {
    expect(logger.getSessionId().startsWith('session-')).toBe(true);
  });
});
