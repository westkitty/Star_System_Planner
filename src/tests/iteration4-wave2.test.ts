import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eventBus } from '../core/event-bus';
import { CameraViewpoint, SceneManager, normalizeCameraViewpoint } from '../rendering/scene-manager';
import { appendFlightReplay, appendFlightStep, createFlightPlan, decodeFlightPlanHandoff, encodeFlightPlanHandoff, flightPlanDigest, makeNudgeStep, validateFlightPlan } from '../simulation/flight-director';
import { CelestialBody } from '../simulation/types';
import { EARTH_MASS_KG, SOLAR_MASS_KG } from '../simulation/units';
import {
  FLIGHT_DIRECTOR_STORAGE_KEY,
  MAX_FLIGHT_REPLAY_ENTRIES,
  MAX_SAVED_FLIGHT_PLANS,
  MAX_SESSION_CAPSULE_CHARS,
  MAX_VIEWPOINT_SHELF,
  SavedFlightPlan,
  SavedViewpoint,
  StorageLike,
  createFlightHandoffUrl,
  cycleViewpointShelf,
  decodeFlightSessionCapsule,
  deleteFlightPlanFromLibrary,
  duplicateFlightPlan,
  encodeFlightSessionCapsule,
  flightPlanJson,
  flightPreflightReport,
  flightReplayCsv,
  listSavedFlightPlans,
  listViewpointShelf,
  loadFlightDirectorState,
  loadFlightPlanFromLibrary,
  parseFlightHandoffFragment,
  saveFlightDirectorState,
  saveFlightPlanToLibrary,
  saveViewpointToShelf,
} from '../persistence/flight-director-storage';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const star: CelestialBody = { id: 'star', name: 'Sol', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#fff' };
const craft: CelestialBody = { id: 'craft', name: 'Surveyor', type: 'station', massKg: EARTH_MASS_KG / 1e6, radiusKm: 10, primaryId: star.id, position: { x: 1e8, y: 0, z: 0 }, velocity: { x: 0, y: 20, z: 0 }, color: '#8cf' };
const makePlan = (title = 'Local plan') => appendFlightStep(createFlightPlan(craft, star, 5, title), makeNudgeStep('prograde', 0.25));
const viewpoint: CameraViewpoint = { version: 1, target: { x: 1, y: 2, z: 3 }, theta: 0.7, phi: 1.1, distance: 240, viewMode: 'inertial' };

describe('Iteration 4 wave 2 persistence and portable artifacts', () => {
  it('round-trips active plan and bounded replay in versioned local state', () => {
    const storage = new MemoryStorage(); const plan = makePlan();
    let replay = [] as Parameters<typeof appendFlightReplay>[0];
    for (let index = 0; index < MAX_FLIGHT_REPLAY_ENTRIES + 5; index++) replay = appendFlightReplay(replay, { planId: plan.id, stepId: plan.steps[0].id, atSec: index, label: 'burn', result: 'complete', detail: 'ok' }, 100);
    saveFlightDirectorState(plan, replay, storage);
    const loaded = loadFlightDirectorState(storage);
    expect(loaded.activePlan).toEqual(plan); expect(loaded.replay).toHaveLength(MAX_FLIGHT_REPLAY_ENTRIES);
  });

  it('fails closed on corrupt, stale, and oversized persisted state', () => {
    const storage = new MemoryStorage();
    for (const raw of ['{bad', JSON.stringify({ version: 999, activePlan: makePlan() }), 'x'.repeat(MAX_SESSION_CAPSULE_CHARS * 2 + 1)]) {
      storage.setItem(FLIGHT_DIRECTOR_STORAGE_KEY, raw);
      expect(loadFlightDirectorState(storage)).toEqual({ activePlan: null, replay: [] });
    }
  });

  it('keeps a bounded multi-plan library with save/list/load/delete clone isolation', () => {
    const storage = new MemoryStorage(); const original = makePlan(); let entries: SavedFlightPlan[] = [];
    for (let index = 0; index < MAX_SAVED_FLIGHT_PLANS + 2; index++) entries = saveFlightPlanToLibrary(original, `Plan ${index}`, storage, `2026-01-${String(index + 1).padStart(2, '0')}`);
    expect(entries).toHaveLength(MAX_SAVED_FLIGHT_PLANS);
    const chosen = entries[0]; const loaded = loadFlightPlanFromLibrary(chosen.id, storage)!;
    loaded.title = 'mutated'; loaded.steps[0].label = 'mutated';
    expect(loadFlightPlanFromLibrary(chosen.id, storage)?.title).not.toBe('mutated');
    expect(loadFlightPlanFromLibrary(chosen.id, storage)?.steps[0].label).not.toBe('mutated');
    expect(deleteFlightPlanFromLibrary(chosen.id, storage)).toHaveLength(MAX_SAVED_FLIGHT_PLANS - 1);
    expect(listSavedFlightPlans(storage).some((entry) => entry.id === chosen.id)).toBe(false);
  });

  it('duplicates as a fresh local plan with fresh queued step ids', () => {
    const original = makePlan(); const duplicate = duplicateFlightPlan(original, 90)!;
    expect(duplicate.id).not.toBe(original.id); expect(duplicate.steps[0].id).not.toBe(original.steps[0].id);
    expect(duplicate.steps[0].status).toBe('queued'); expect(duplicate.createdAtSec).toBe(90);
  });

  it('exports readable JSON, escaped replay CSV, and concise preflight evidence', () => {
    const plan = makePlan('Export plan');
    expect(JSON.parse(flightPlanJson(plan)).title).toBe('Export plan');
    const csv = flightReplayCsv([{ planId: plan.id, stepId: plan.steps[0].id, atSec: 4, result: 'rejected', label: 'Burn, "A"', detail: 'line 1\nline 2' }], plan.id);
    expect(csv).toContain('"Burn, ""A"""'); expect(csv).toContain('"line 1\nline 2"');
    const report = flightPreflightReport(plan, [star, craft]);
    expect(report).toContain(`Craft ID: ${craft.id}`); expect(report).toContain(`Primary ID: ${star.id}`); expect(report).toContain(`Fingerprint: ${flightPlanDigest(plan)}`); expect(report).toContain('Estimated total delta-v:'); expect(report).toContain('Risk:');
  });

  it('creates and parses a same-origin URL fragment and rejects unrelated fragments', () => {
    const code = encodeFlightPlanHandoff(makePlan());
    const url = createFlightHandoffUrl(code, { origin: 'https://planner.test', pathname: '/app', search: '?local=1' } as Location)!;
    expect(url.startsWith('https://planner.test/app?local=1#flight=')).toBe(true);
    expect(parseFlightHandoffFragment(new URL(url).hash)).toBe(code);
    expect(parseFlightHandoffFragment('#other=ssp-fd%3Abad')).toBeNull();
  });

  it('round-trips Unicode titles through UTF-8 handoff and normalizes imported fields', () => {
    const plan = makePlan('航路 Δv — café'); const raw = JSON.parse(atob(encodeFlightPlanHandoff(plan).slice(7).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encodeFlightPlanHandoff(plan).slice(7).length + 3) % 4)));
    raw.title = `  ${'航'.repeat(90)}  `; raw.steps[0].status = 'executing'; raw.steps.push(...Array.from({ length: 20 }, () => ({ ...raw.steps[0], id: crypto.randomUUID() })));
    const bytes = new TextEncoder().encode(JSON.stringify(raw)); let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const imported = decodeFlightPlanHandoff(`ssp-fd:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`)!;
    expect(imported.id).not.toBe(plan.id); expect(imported.title.length).toBeLessThanOrEqual(72); expect(imported.title).toContain('航'); expect(imported.steps).toHaveLength(12); expect(imported.steps[0].status).toBe('queued');
  });

  it('rejects malformed base64 and structural plans without throwing', () => {
    expect(() => decodeFlightPlanHandoff('ssp-fd:%%%')).not.toThrow(); expect(decodeFlightPlanHandoff('ssp-fd:%%%')).toBeNull();
    expect(validateFlightPlan({ version: 999 } as never, [])).toEqual([expect.objectContaining({ code: 'INVALID_PLAN', severity: 'block' })]);
  });

  it('round-trips a versioned plan plus optional viewpoint capsule with fresh ids', () => {
    const plan = makePlan('航路 capsule'); const encoded = encodeFlightSessionCapsule(plan, viewpoint)!; const decoded = decodeFlightSessionCapsule(encoded, 12)!;
    expect(decoded.plan.title).toBe(plan.title); expect(decoded.plan.id).not.toBe(plan.id); expect(decoded.plan.steps[0].id).not.toBe(plan.steps[0].id); expect(decoded.viewpoint).toEqual(viewpoint);
    expect(decodeFlightSessionCapsule(encodeFlightSessionCapsule(plan)! )?.viewpoint).toBeNull();
  });

  it('rejects corrupt, incompatible, and oversized capsules', () => {
    expect(decodeFlightSessionCapsule('ssp-session:%%%')).toBeNull();
    expect(decodeFlightSessionCapsule(`ssp-session:${'a'.repeat(MAX_SESSION_CAPSULE_CHARS)}`)).toBeNull();
    const incompatible = btoa(JSON.stringify({ version: 99, plan: {} })).replace(/=/g, '');
    expect(decodeFlightSessionCapsule(`ssp-session:${incompatible}`)).toBeNull();
  });
});

describe('Iteration 4 wave 2 camera viewpoints', () => {
  it('clamps finite camera data and rejects non-finite or unknown modes', () => {
    expect(normalizeCameraViewpoint({ ...viewpoint, target: { x: 2e9, y: -2e9, z: 0 }, theta: -1, phi: 99, distance: 1 })).toEqual(expect.objectContaining({ target: { x: 1e6, y: -1e6, z: 0 }, phi: Math.PI - 0.05, distance: 10 }));
    expect(normalizeCameraViewpoint({ ...viewpoint, distance: Infinity })).toBeNull();
    expect(normalizeCameraViewpoint({ ...viewpoint, viewMode: 'private-camera-mode' })).toBeNull();
  });

  it('restores through SceneManager public state with clamps and one synchronous update', () => {
    let updates = 0;
    const fake = { viewMode: 'inertial', cameraTarget: new THREE.Vector3(), desiredTarget: new THREE.Vector3(), cameraDistance: 0, cameraSpherical: new THREE.Spherical(), updateCameraPosition: () => { updates++; } };
    const restored = SceneManager.prototype.restoreCameraViewpoint.call(fake as never, { ...viewpoint, phi: -5, distance: 99999 });
    expect(restored).toBe(true); expect(fake.cameraDistance).toBe(15000); expect(fake.cameraSpherical.phi).toBe(0.05); expect(fake.desiredTarget.toArray()).toEqual([1, 2, 3]); expect(updates).toBe(1);
  });

  it('persists a bounded viewpoint shelf and cycles previous/next with wraparound', () => {
    const storage = new MemoryStorage(); let shelf: SavedViewpoint[] = [];
    for (let index = 0; index < MAX_VIEWPOINT_SHELF + 2; index++) shelf = saveViewpointToShelf({ ...viewpoint, theta: index }, `View ${index}`, storage, String(index));
    expect(shelf).toHaveLength(MAX_VIEWPOINT_SHELF); expect(listViewpointShelf(storage)).toHaveLength(MAX_VIEWPOINT_SHELF);
    const first = cycleViewpointShelf(shelf, -1, 1)!; expect(first.index).toBe(0);
    expect(cycleViewpointShelf(shelf, first.index, -1)?.index).toBe(MAX_VIEWPOINT_SHELF - 1);
  });
});

describe('Iteration 4 typed completion integration', () => {
  it('publishes a typed flight completion payload through the existing event bus', () => {
    eventBus.clear(); let payload: { planId: string; stepId: string; label: string } | null = null;
    const off = eventBus.on('flight:step-completed', (event) => { payload = event.payload; });
    eventBus.emit('flight:step-completed', { planId: 'p', stepId: 's', label: 'burn' }); off();
    expect(payload).toEqual({ planId: 'p', stepId: 's', label: 'burn' });
  });
});
