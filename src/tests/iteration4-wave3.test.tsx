import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FlightDirectorPanel } from '../ui/FlightDirectorPanel';
import { SHORTCUT_DEFINITIONS, isEditableTarget, shortcutIdForEvent } from '../ui/shortcuts';
import { CelestialBody } from '../simulation/types';
import { G_KM, KM_PER_AU, SOLAR_MASS_KG } from '../simulation/units';
import {
  advanceFlightStep, appendFlightStep, buildFlightBrief, clearCompletedFlightSteps,
  clearSkippedFlightSteps, createFlightPlan, estimateStepDeltaV, makeCircularizeStep,
  makeMatchVelocityStep, makeNudgeStep, makeTransferStep, nextQueuedStep,
  normalizeFlightPlanTitle, rejectFlightStep, validateFlightPlan,
} from '../simulation/flight-director';
import {
  DEFAULT_FLIGHT_DIRECTOR_PREFERENCES, FLIGHT_DIRECTOR_PREFERENCES_KEY,
  FlightDirectorPreferences, clampDirectorMagnitude, loadFlightDirectorPreferences,
  saveFlightDirectorPreferences,
} from '../persistence/flight-director-preferences';
import type { StorageLike } from '../persistence/flight-director-storage';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const star: CelestialBody = { id: 'star', name: 'Sol', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#fff' };
const circularSpeed = Math.sqrt((G_KM * star.massKg) / KM_PER_AU);
const craft: CelestialBody = { id: 'craft', name: 'Surveyor', type: 'station', massKg: 1e18, radiusKm: 10, primaryId: star.id, position: { x: KM_PER_AU, y: 0, z: 0 }, velocity: { x: 0, y: circularSpeed, z: 0 }, color: '#8cf' };
const target: CelestialBody = { ...craft, id: 'target', name: 'Harbor', position: { x: KM_PER_AU * 1.5, y: 0, z: 0 }, velocity: { x: 0, y: circularSpeed * 0.8, z: 0 } };
const bodies = [star, craft, target];

function keyEvent(key: string, shiftKey = false): KeyboardEvent {
  return { key, shiftKey, ctrlKey: false, metaKey: false, altKey: false } as KeyboardEvent;
}

describe('Iteration 4 wave 3 gameplay loop', () => {
  it('exposes all six physical impulse directions without aliases', () => {
    const directions = ['prograde', 'retrograde', 'radial-in', 'radial-out', 'normal', 'anti-normal'] as const;
    expect(directions.map((direction) => makeNudgeStep(direction).direction)).toEqual(directions);
  });

  it('execute-next skips both completed and rejected terminal entries', () => {
    let plan = createFlightPlan(craft, star, 0);
    plan = appendFlightStep(plan, makeCircularizeStep()); plan = appendFlightStep(plan, makeNudgeStep('retrograde')); plan = appendFlightStep(plan, makeNudgeStep('normal'));
    plan = advanceFlightStep(plan, plan.steps[0].id); plan = rejectFlightStep(plan, plan.steps[1].id);
    expect(plan.steps[1].status).toBe('skipped'); expect(nextQueuedStep(plan)?.id).toBe(plan.steps[2].id);
  });

  it('completing or rejecting one explicit step never advances another', () => {
    let plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde'));
    plan = appendFlightStep(plan, makeNudgeStep('retrograde'));
    expect(advanceFlightStep(plan, plan.steps[1].id).steps.map((step) => step.status)).toEqual(['queued', 'complete']);
    expect(rejectFlightStep(plan, plan.steps[1].id).steps.map((step) => step.status)).toEqual(['queued', 'skipped']);
  });

  it('uses a target live radius when estimating a transfer', () => {
    const step = makeTransferStep(target, star); const movedTarget = { ...target, position: { x: KM_PER_AU * 2, y: 0, z: 0 } };
    expect(estimateStepDeltaV(step, craft, star, [star, craft, movedTarget])).not.toBeCloseTo(estimateStepDeltaV(step, craft, star, bodies));
  });

  it('estimates circularization and classifies live escape/eccentricity risk', () => {
    const eccentricCraft = { ...craft, velocity: { x: 0, y: circularSpeed * 0.65, z: 0 } };
    const plan = appendFlightStep(createFlightPlan(eccentricCraft, star, 0), makeCircularizeStep());
    expect(estimateStepDeltaV(plan.steps[0], eccentricCraft, star, [star, eccentricCraft])).toBeGreaterThan(0);
    expect(buildFlightBrief(plan, [star, eccentricCraft]).risk).toBe('amber');
  });

  it('blocks an invalid primary relationship and a self target', () => {
    const wrongPrimary = { ...star, id: 'other-star' }; const plan = appendFlightStep(createFlightPlan(craft, wrongPrimary, 0), makeMatchVelocityStep(craft));
    const codes = validateFlightPlan(plan, [star, wrongPrimary, craft]).map((issue) => issue.code);
    expect(codes).toContain('NO_PRIMARY'); expect(codes).toContain('MISSING_TARGET');
  });
});

describe('Iteration 4 wave 3 quality-of-life state', () => {
  it('normalizes bounded titles and supplies a sensible blank fallback', () => {
    expect(normalizeFlightPlanTitle('  Burn\n plan  ')).toBe('Burn plan');
    expect(normalizeFlightPlanTitle('   ', 'Surveyor flight plan')).toBe('Surveyor flight plan');
    expect(normalizeFlightPlanTitle('x'.repeat(100))).toHaveLength(72);
  });

  it('falls back on corrupt preferences and clamps unsafe magnitudes', () => {
    const storage = new MemoryStorage(); storage.setItem(FLIGHT_DIRECTOR_PREFERENCES_KEY, '{broken');
    expect(loadFlightDirectorPreferences(storage)).toEqual(DEFAULT_FLIGHT_DIRECTOR_PREFERENCES);
    expect(clampDirectorMagnitude(-10)).toBe(0.001); expect(clampDirectorMagnitude(99)).toBe(20); expect(clampDirectorMagnitude('bad')).toBe(0.05);
  });

  it('persists open state, direction, target, magnitude, and section disclosure locally', () => {
    const storage = new MemoryStorage(); const preferences: FlightDirectorPreferences = { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES, open: true, direction: 'anti-normal', magnitudeKmS: 0.75, targetId: target.id, sections: { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES.sections, library: true } };
    saveFlightDirectorPreferences(preferences, storage);
    expect(loadFlightDirectorPreferences(storage)).toEqual(preferences);
  });

  it('clears completed and skipped steps independently while preserving queued work', () => {
    let plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde')); plan = appendFlightStep(plan, makeNudgeStep('retrograde')); plan = appendFlightStep(plan, makeNudgeStep('normal'));
    plan = advanceFlightStep(plan, plan.steps[0].id); plan = rejectFlightStep(plan, plan.steps[1].id);
    expect(clearCompletedFlightSteps(plan).steps.map((step) => step.status)).toEqual(['skipped', 'queued']);
    expect(clearSkippedFlightSteps(plan).steps.map((step) => step.status)).toEqual(['complete', 'queued']);
  });

  it('documents Director shortcuts and maps them without consuming editable targets', () => {
    expect(SHORTCUT_DEFINITIONS).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'toggle-flight-director', keys: ['D'] }), expect.objectContaining({ id: 'execute-flight-director-next', keys: ['Shift+Enter'] })]));
    expect(shortcutIdForEvent(keyEvent('D'))).toBe('toggle-flight-director'); expect(shortcutIdForEvent(keyEvent('Enter', true))).toBe('execute-flight-director-next'); expect(isEditableTarget(null)).toBe(false);
  });
});

describe('Iteration 4 wave 3 Director surface', () => {
  it('SSR exposes context, status, progress, empty states, target actions, and pending-link review', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('radial-out', 0.2));
    const props: React.ComponentProps<typeof FlightDirectorPanel> = {
      plan, bodies, selectedBody: craft, simTimeSec: 12, replay: [], savedPlans: [], viewpointCount: 0, pendingHandoff: 'ssp-fd:valid', preview: null, preferences: DEFAULT_FLIGHT_DIRECTOR_PREFERENCES,
      onPreferencesChange: () => undefined, onCreate: () => undefined, onChange: () => undefined, onExecute: () => undefined, onExecuteNext: () => undefined,
      onImport: () => undefined, onExport: () => undefined, onSavePlan: () => undefined, onLoadSaved: () => undefined, onDeleteSaved: () => undefined, onDuplicate: () => undefined,
      onExportArtifact: () => undefined, onShare: () => undefined, onImportPending: () => undefined, onDismissPending: () => undefined, onCaptureViewpoint: () => undefined,
      onCycleViewpoint: () => undefined, onExportCapsule: () => '', onImportCapsule: () => undefined, onClearReplay: () => undefined, onFocusCraft: () => undefined,
      onFocusTarget: () => undefined, onFeedback: () => undefined, onPreview: () => undefined, onClearPreview: () => undefined, onClose: () => undefined,
    };
    const html = renderToStaticMarkup(<FlightDirectorPanel {...props} />);
    for (const text of ['Surveyor', 'Sol', 'GO/NO-GO', 'Progress:', 'No replay entries for this plan yet.', 'No saved flight plans yet.', 'REVIEW &amp; IMPORT', 'TRANSFER', 'MATCH', 'radial out']) expect(html).toContain(text);
    expect(html).toContain('<progress');
  });

  it('SSR direction composer contains exactly the six physical choices', () => {
    const panelSource = readFileSync(new URL('../ui/FlightDirectorPanel.tsx', import.meta.url), 'utf8');
    for (const direction of ['prograde', 'retrograde', 'radial-in', 'radial-out', 'normal', 'anti-normal']) expect(panelSource).toContain(`value: '${direction}'`);
  });

  it('mobile stylesheet retains safe areas, full-width bottom sheet, focus visibility, and 44px touch controls', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    expect(css).toContain('@media (max-width: 700px)'); expect(css).toContain('env(safe-area-inset-bottom)'); expect(css).toContain('width: 100vw'); expect(css).toContain('.flight-director-panel button { min-height: 44px; }'); expect(css).toContain('button:focus-visible'); expect(css).toContain('overflow-x: hidden');
  });
});
