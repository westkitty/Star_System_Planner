/** Iteration 4 — Flight Director regression contract. */
import { describe, expect, it } from 'vitest';
import { EARTH_MASS_KG, G_KM, KM_PER_AU, SOLAR_MASS_KG } from '../simulation/units';
import { CelestialBody } from '../simulation/types';
import { MAX_DIRECTOR_DELTA_V_KMS, MAX_FLIGHT_PLAN_STEPS, advanceFlightStep, appendFlightReplay, appendFlightStep, buildFlightBrief, createFlightPlan, decodeFlightPlanHandoff, encodeFlightPlanHandoff, estimateStepDeltaV, flightPlanDigest, makeCircularizeStep, makeMatchVelocityStep, makeNudgeStep, makeTransferStep, moveFlightStep, nextQueuedStep, removeFlightStep, replaySummary, serializeFlightPlan, validateFlightPlan } from '../simulation/flight-director';

const star: CelestialBody = { id: 'star', name: 'Sol', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#fff' };
const speed = Math.sqrt((G_KM * star.massKg) / KM_PER_AU);
const craft: CelestialBody = { id: 'craft', name: 'Surveyor', type: 'station', massKg: EARTH_MASS_KG / 1000000, radiusKm: 20, primaryId: star.id, position: { x: KM_PER_AU, y: 0, z: 0 }, velocity: { x: 0, y: speed, z: 0 }, color: '#8cf' };
const target: CelestialBody = { ...craft, id: 'target', name: 'Harbor', position: { x: KM_PER_AU * 1.5, y: 0, z: 0 }, velocity: { x: 0, y: speed * 0.8, z: 0 } };
const bodies = [star, craft, target];

describe('WOW-01 Flight Director plans', () => {
  it('creates an inert, versioned plan scoped to a craft and its primary', () => {
    const plan = createFlightPlan(craft, star, 42);
    expect(plan.version).toBe(1); expect(plan.craftId).toBe(craft.id); expect(plan.primaryId).toBe(star.id); expect(plan.steps).toEqual([]);
  });
  it('sanitizes empty title and non-finite creation time', () => expect(createFlightPlan(craft, star, Number.NaN, '  ').createdAtSec).toBe(0));
  it('creates bounded positive nudge steps', () => expect(makeNudgeStep('prograde', 999).deltaVKmS).toBe(20));
  it('gives circularization a distinct no-target step shape', () => expect(makeCircularizeStep().targetId).toBeUndefined());
  it('binds velocity matching to the named target', () => expect(makeMatchVelocityStep(target).targetId).toBe(target.id));
  it('measures transfer target radius from its live primary-relative position', () => expect(makeTransferStep(target, star).targetRadiusKm).toBeCloseTo(KM_PER_AU * 1.5));
  it('appends only up to the bounded queue capacity', () => {
    let plan = createFlightPlan(craft, star, 0); for (let i = 0; i < MAX_FLIGHT_PLAN_STEPS + 3; i++) plan = appendFlightStep(plan, makeNudgeStep('prograde'));
    expect(plan.steps).toHaveLength(MAX_FLIGHT_PLAN_STEPS);
  });
  it('removes only the requested step', () => {
    let plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde')); const id = plan.steps[0].id; plan = appendFlightStep(plan, makeCircularizeStep());
    expect(removeFlightStep(plan, id).steps).toHaveLength(1);
  });
  it('reorders within bounds and preserves out-of-range order', () => {
    let plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde')); plan = appendFlightStep(plan, makeCircularizeStep());
    expect(moveFlightStep(plan, plan.steps[1].id, -1).steps[0].kind).toBe('circularize');
    expect(moveFlightStep(plan, plan.steps[0].id, -1)).toEqual(plan);
  });
  it('advances one immutable execution state', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeCircularizeStep());
    expect(advanceFlightStep(plan, plan.steps[0].id).steps[0].status).toBe('complete');
  });
  it('finds the next queued step after completed entries', () => {
    let plan = appendFlightStep(createFlightPlan(craft, star, 0), makeCircularizeStep()); plan = appendFlightStep(plan, makeNudgeStep('retrograde')); plan = advanceFlightStep(plan, plan.steps[0].id);
    expect(nextQueuedStep(plan)?.kind).toBe('nudge');
  });
  it('blocks plans whose craft is absent from the active branch', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeCircularizeStep());
    expect(validateFlightPlan(plan, [star]).some((issue) => issue.code === 'NO_CRAFT' && issue.severity === 'block')).toBe(true);
  });
  it('blocks target-relative steps when their target disappears', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeMatchVelocityStep(target));
    expect(validateFlightPlan(plan, [star, craft]).some((issue) => issue.code === 'MISSING_TARGET')).toBe(true);
  });
  it('warns rather than pretends an empty plan can execute', () => expect(validateFlightPlan(createFlightPlan(craft, star, 0), bodies).some((issue) => issue.code === 'NO_STEPS')).toBe(true));
  it('enforces the aggregate director delta-v safety cap', () => {
    let plan = createFlightPlan(craft, star, 0); for (let i = 0; i < 5; i++) plan = appendFlightStep(plan, makeNudgeStep('prograde', 20));
    expect(validateFlightPlan(plan, bodies).some((issue) => issue.code === 'DV_BUDGET' && issue.message.includes(String(MAX_DIRECTOR_DELTA_V_KMS)))).toBe(true);
  });
  it('estimates target-relative matching delta-v from live state', () => expect(estimateStepDeltaV(makeMatchVelocityStep(target), craft, star, bodies)).toBeGreaterThan(0));
  it('produces a green brief for a valid low-risk trim', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde'));
    expect(buildFlightBrief(plan, bodies).risk).toBe('green');
  });
  it('serializes deterministically and fingerprints plan content', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeCircularizeStep());
    expect(serializeFlightPlan(plan)).toContain('circularize'); expect(flightPlanDigest(plan)).toMatch(/^FD-/);
  });
  it('round-trips a compact offline handoff while minting a new local id', () => {
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeTransferStep(target, star)); const decoded = decodeFlightPlanHandoff(encodeFlightPlanHandoff(plan), 99);
    expect(decoded?.id).not.toBe(plan.id); expect(decoded?.steps[0].targetId).toBe(target.id);
  });
  it('rejects malformed and incompatible handoff codes without throwing', () => { expect(decodeFlightPlanHandoff('bad')).toBeNull(); expect(decodeFlightPlanHandoff('ssp-fd:!!!')).toBeNull(); });
  it('keeps a bounded causal replay and reports outcome counts per plan', () => {
    const plan = createFlightPlan(craft, star, 0); const step = makeCircularizeStep();
    let log = appendFlightReplay([], { planId: plan.id, stepId: step.id, atSec: 1, label: step.label, result: 'complete', detail: 'ok' }, 2);
    log = appendFlightReplay(log, { planId: plan.id, stepId: step.id, atSec: 2, label: step.label, result: 'rejected', detail: 'no' }, 2);
    expect(replaySummary(log, plan.id)).toEqual({ complete: 1, rejected: 1, skipped: 0 });
  });
});
