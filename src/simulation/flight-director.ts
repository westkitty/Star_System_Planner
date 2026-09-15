/**
 * Flight Director is a local-only, inspectable maneuver-sequence layer.
 * It deliberately produces plans and safety evidence; App owns every actual
 * engine mutation so the existing undo/event/scene pipeline stays authoritative.
 */
import { createId } from '../core/id';
import { CelestialBody } from './types';
import { calculateOsculatingElements } from './orbital-mechanics';
import { applyNudge, circularizeOrbit, escapeMarginKmS, matchVelocity, NudgeDirection } from './maneuvers';
import { applyTransferDeparture, planHohmann } from './transfer-planner';

export const FLIGHT_PLAN_VERSION = 1;
export const MAX_FLIGHT_PLAN_STEPS = 12;
export const MAX_DIRECTOR_DELTA_V_KMS = 80;
export const MAX_FLIGHT_PLAN_TITLE_LENGTH = 72;

export type FlightStepKind = 'nudge' | 'circularize' | 'match-velocity' | 'transfer';
export type FlightStepStatus = 'queued' | 'complete' | 'skipped';

export interface FlightPlanStep {
  id: string;
  kind: FlightStepKind;
  label: string;
  direction?: NudgeDirection;
  deltaVKmS?: number;
  targetId?: string;
  targetRadiusKm?: number;
  status: FlightStepStatus;
}

export interface FlightPlan {
  version: number;
  id: string;
  title: string;
  craftId: string;
  primaryId: string;
  createdAtSec: number;
  steps: FlightPlanStep[];
}

export interface PlanIssue {
  code: 'INVALID_PLAN' | 'NO_CRAFT' | 'NO_PRIMARY' | 'NO_STEPS' | 'TOO_MANY_STEPS' | 'BAD_STEP' | 'MISSING_TARGET' | 'DV_BUDGET';
  severity: 'block' | 'warn';
  message: string;
  stepId?: string;
}

export function normalizeFlightPlanTitle(value: unknown, fallback = 'Imported flight plan'): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, MAX_FLIGHT_PLAN_TITLE_LENGTH) || fallback;
}

export interface FlightBrief {
  planId: string;
  craftName: string;
  totalDeltaVKmS: number;
  queuedSteps: number;
  escapeMarginKmS: number | null;
  eccentricity: number | null;
  risk: 'green' | 'amber' | 'red';
  issues: PlanIssue[];
}

export interface FlightReplayEntry {
  planId: string;
  stepId: string;
  atSec: number;
  label: string;
  result: 'complete' | 'skipped' | 'rejected';
  detail: string;
}

export function createFlightPlan(craft: CelestialBody, primary: CelestialBody, atSec: number, title = `${craft.name} flight plan`): FlightPlan {
  return {
    version: FLIGHT_PLAN_VERSION,
    id: createId('flight-plan'),
    title: normalizeFlightPlanTitle(title, `${craft.name} flight plan`),
    craftId: craft.id,
    primaryId: primary.id,
    createdAtSec: Math.max(0, Number.isFinite(atSec) ? atSec : 0),
    steps: [],
  };
}

export function makeNudgeStep(direction: NudgeDirection, deltaVKmS = 0.05): FlightPlanStep {
  const dv = Math.max(0.001, Math.min(20, Number.isFinite(deltaVKmS) ? deltaVKmS : 0.05));
  return { id: createId('flight-step'), kind: 'nudge', label: `${direction.replace('-', ' ')} ${dv.toFixed(3)} km/s`, direction, deltaVKmS: dv, status: 'queued' };
}

export function makeCircularizeStep(): FlightPlanStep {
  return { id: createId('flight-step'), kind: 'circularize', label: 'Circularize at current radius', status: 'queued' };
}

export function makeMatchVelocityStep(target: CelestialBody): FlightPlanStep {
  return { id: createId('flight-step'), kind: 'match-velocity', label: `Match velocity: ${target.name}`, targetId: target.id, status: 'queued' };
}

export function makeTransferStep(target: CelestialBody, primary: CelestialBody): FlightPlanStep {
  const radius = Math.hypot(target.position.x - primary.position.x, target.position.y - primary.position.y, target.position.z - primary.position.z);
  return { id: createId('flight-step'), kind: 'transfer', label: `Transfer toward ${target.name}`, targetId: target.id, targetRadiusKm: radius, status: 'queued' };
}

export function appendFlightStep(plan: FlightPlan, step: FlightPlanStep): FlightPlan {
  if (plan.steps.length >= MAX_FLIGHT_PLAN_STEPS) return plan;
  return { ...plan, steps: [...plan.steps, { ...step, status: 'queued' }] };
}

export function removeFlightStep(plan: FlightPlan, stepId: string): FlightPlan {
  return { ...plan, steps: plan.steps.filter((step) => step.id !== stepId) };
}

export function renameFlightPlan(plan: FlightPlan, title: unknown): FlightPlan {
  return { ...plan, title: normalizeFlightPlanTitle(title, `${plan.title || 'Flight plan'}`) };
}

export function clearCompletedFlightSteps(plan: FlightPlan): FlightPlan {
  return { ...plan, steps: plan.steps.filter((step) => step.status !== 'complete') };
}

export function clearSkippedFlightSteps(plan: FlightPlan): FlightPlan {
  return { ...plan, steps: plan.steps.filter((step) => step.status !== 'skipped') };
}

export function moveFlightStep(plan: FlightPlan, stepId: string, direction: -1 | 1): FlightPlan {
  const index = plan.steps.findIndex((step) => step.id === stepId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= plan.steps.length) return plan;
  const steps = [...plan.steps];
  [steps[index], steps[next]] = [steps[next], steps[index]];
  return { ...plan, steps };
}

export function advanceFlightStep(plan: FlightPlan, stepId: string, status: FlightStepStatus = 'complete'): FlightPlan {
  return { ...plan, steps: plan.steps.map((step) => step.id === stepId ? { ...step, status } : step) };
}

export function rejectFlightStep(plan: FlightPlan, stepId: string): FlightPlan {
  return advanceFlightStep(plan, stepId, 'skipped');
}

export function nextQueuedStep(plan: FlightPlan): FlightPlanStep | null {
  return plan.steps.find((step) => step.status === 'queued') ?? null;
}

export function estimateStepDeltaV(step: FlightPlanStep, craft: CelestialBody, primary: CelestialBody, bodies: CelestialBody[]): number {
  if (step.kind === 'nudge') return step.deltaVKmS ?? 0;
  if (step.kind === 'circularize') {
    const rx = craft.position.x - primary.position.x; const ry = craft.position.y - primary.position.y; const rz = craft.position.z - primary.position.z;
    const vx = craft.velocity.x - primary.velocity.x; const vy = craft.velocity.y - primary.velocity.y; const vz = craft.velocity.z - primary.velocity.z;
    const radius = Math.hypot(rx, ry, rz); const mu = 6.67430e-20 * primary.massKg;
    if (radius <= 0 || mu <= 0) return 0;
    const radialSpeed = (rx * vx + ry * vy + rz * vz) / radius;
    const tangentialSpeed = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - radialSpeed * radialSpeed));
    return Math.hypot(radialSpeed, Math.sqrt(mu / radius) - tangentialSpeed);
  }
  if (step.kind === 'transfer') {
    const target = bodies.find((body) => body.id === step.targetId);
    const liveRadius = target ? Math.hypot(target.position.x - primary.position.x, target.position.y - primary.position.y, target.position.z - primary.position.z) : step.targetRadiusKm;
    return liveRadius ? planHohmann(craft, primary, liveRadius)?.totalDvKmS ?? 0 : 0;
  }
  if (step.kind === 'match-velocity' && step.targetId) {
    const target = bodies.find((body) => body.id === step.targetId);
    return target ? Math.hypot(target.velocity.x - craft.velocity.x, target.velocity.y - craft.velocity.y, target.velocity.z - craft.velocity.z) : 0;
  }
  return 0;
}

export function validateFlightPlan(plan: FlightPlan, bodies: CelestialBody[]): PlanIssue[] {
  if (!plan || typeof plan !== 'object' || plan.version !== FLIGHT_PLAN_VERSION || typeof plan.id !== 'string' || !plan.id || typeof plan.title !== 'string' || typeof plan.craftId !== 'string' || !plan.craftId || typeof plan.primaryId !== 'string' || !plan.primaryId || !Number.isFinite(plan.createdAtSec) || plan.createdAtSec < 0 || !Array.isArray(plan.steps)) {
    return [{ code: 'INVALID_PLAN', severity: 'block', message: 'The flight plan structure is malformed or incompatible.' }];
  }
  const craft = bodies.find((body) => body.id === plan.craftId);
  const primary = bodies.find((body) => body.id === plan.primaryId);
  const issues: PlanIssue[] = [];
  if (!craft || craft.type === 'star') issues.push({ code: 'NO_CRAFT', severity: 'block', message: 'The planned craft is missing or is not a maneuverable non-star body.' });
  if (!primary || primary.id === craft?.id || craft?.primaryId !== primary?.id || !(primary.massKg > 0)) issues.push({ code: 'NO_PRIMARY', severity: 'block', message: 'The craft’s actual reference primary is missing or invalid in this timeline.' });
  if (plan.steps.length === 0) issues.push({ code: 'NO_STEPS', severity: 'warn', message: 'Add a maneuver before arming the plan.' });
  if (plan.steps.length > MAX_FLIGHT_PLAN_STEPS) issues.push({ code: 'TOO_MANY_STEPS', severity: 'block', message: `Flight Director permits at most ${MAX_FLIGHT_PLAN_STEPS} queued maneuvers.` });
  let estimatedDeltaV = 0;
  for (const step of plan.steps) {
    if (!step || typeof step.id !== 'string' || typeof step.label !== 'string' || !['nudge', 'circularize', 'match-velocity', 'transfer'].includes(step.kind) || !['queued', 'complete', 'skipped'].includes(step.status)) {
      issues.push({ code: 'BAD_STEP', severity: 'block', message: 'A maneuver step has an invalid structure.', stepId: step?.id });
      continue;
    }
    if (step.kind === 'nudge' && (!step.direction || !Number.isFinite(step.deltaVKmS) || (step.deltaVKmS ?? 0) <= 0 || (step.deltaVKmS ?? 0) > 20)) issues.push({ code: 'BAD_STEP', severity: 'block', message: 'A nudge requires a finite positive delta-v within the per-step limit.', stepId: step.id });
    if ((step.kind === 'match-velocity' || step.kind === 'transfer') && (!step.targetId || step.targetId === plan.craftId || !bodies.some((body) => body.id === step.targetId))) issues.push({ code: 'MISSING_TARGET', severity: 'block', message: 'A maneuver target is missing, invalid, or no longer exists in this timeline.', stepId: step.id });
    if (step.status === 'queued' && craft && primary) estimatedDeltaV += estimateStepDeltaV(step, craft, primary, bodies);
  }
  if (estimatedDeltaV > MAX_DIRECTOR_DELTA_V_KMS) issues.push({ code: 'DV_BUDGET', severity: 'block', message: `Estimated delta-v ${estimatedDeltaV.toFixed(1)} km/s exceeds the ${MAX_DIRECTOR_DELTA_V_KMS} km/s safety cap.` });
  return issues;
}

export function buildFlightBrief(plan: FlightPlan, bodies: CelestialBody[]): FlightBrief {
  const craft = bodies.find((body) => body.id === plan.craftId);
  const primary = bodies.find((body) => body.id === plan.primaryId);
  const issues = validateFlightPlan(plan, bodies);
  const totalDeltaVKmS = craft && primary ? plan.steps.filter((step) => step.status === 'queued').reduce((sum, step) => sum + estimateStepDeltaV(step, craft, primary, bodies), 0) : 0;
  const escape = craft && primary ? escapeMarginKmS(craft, primary) : null;
  const elements = craft && primary ? calculateOsculatingElements(craft, primary) : null;
  const blocked = issues.some((issue) => issue.severity === 'block');
  const risk = blocked || (escape !== null && escape < 0) ? 'red' : (escape !== null && escape < 0.5) || (elements?.eccentricity ?? 0) > 0.45 ? 'amber' : 'green';
  return { planId: plan.id, craftName: craft?.name ?? 'Missing craft', totalDeltaVKmS, queuedSteps: plan.steps.filter((step) => step.status === 'queued').length, escapeMarginKmS: escape, eccentricity: elements?.eccentricity ?? null, risk, issues };
}

export interface FlightPlanPreviewOutcome {
  stepId: string;
  label: string;
  result: 'applied' | 'rejected';
  detail: string;
}

export interface FlightPlanPreview {
  bodies: CelestialBody[];
  craftId: string;
  blockedIssues: PlanIssue[];
  outcomes: FlightPlanPreviewOutcome[];
}

/** Apply queued maneuvers to cloned bodies only; live simulation state is never mutated. */
export function previewFlightPlan(plan: FlightPlan, bodies: CelestialBody[]): FlightPlanPreview {
  const cloned = bodies.map((body) => ({ ...body, position: { ...body.position }, velocity: { ...body.velocity } }));
  const blockedIssues = validateFlightPlan(plan, bodies).filter((issue) => issue.severity === 'block');
  const preview: FlightPlanPreview = { bodies: cloned, craftId: plan.craftId, blockedIssues, outcomes: [] };
  if (blockedIssues.length > 0) return preview;
  const craft = cloned.find((body) => body.id === plan.craftId);
  const primary = cloned.find((body) => body.id === plan.primaryId);
  if (!craft || !primary) return preview;
  for (const step of plan.steps) {
    if (step.status !== 'queued') continue;
    let result = { applied: false, deltaVKmS: 0, detail: 'Unsupported preview step.' };
    if (step.kind === 'nudge' && step.direction && step.deltaVKmS) result = applyNudge(craft, primary, step.direction, step.deltaVKmS);
    else if (step.kind === 'circularize') result = circularizeOrbit(craft, primary);
    else if (step.kind === 'match-velocity' && step.targetId) {
      const target = cloned.find((body) => body.id === step.targetId);
      if (target) result = matchVelocity(craft, target);
    } else if (step.kind === 'transfer' && step.targetId) {
      const target = cloned.find((body) => body.id === step.targetId);
      if (target) {
        const radius = Math.hypot(target.position.x - primary.position.x, target.position.y - primary.position.y, target.position.z - primary.position.z);
        const transfer = planHohmann(craft, primary, radius);
        if (transfer) result = applyTransferDeparture(craft, primary, transfer);
      }
    }
    preview.outcomes.push({ stepId: step.id, label: step.label, result: result.applied ? 'applied' : 'rejected', detail: result.detail });
  }
  return preview;
}

/** Stable, plain JSON payload suitable for offline transfer in a fragment or file. */
export function serializeFlightPlan(plan: FlightPlan): string {
  return JSON.stringify({ version: FLIGHT_PLAN_VERSION, title: plan.title, craftId: plan.craftId, primaryId: plan.primaryId, createdAtSec: plan.createdAtSec, steps: plan.steps });
}

export function flightPlanDigest(plan: FlightPlan): string {
  let hash = 2166136261;
  for (const ch of serializeFlightPlan(plan)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `FD-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

function toBase64Url(value: string): string {
  const encoded = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value) : fallbackUtf8Encode(value);
  let binary = '';
  encoded.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
}

function fallbackUtf8Encode(value: string): Uint8Array {
  const escaped = encodeURIComponent(value); const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index++) {
    if (escaped[index] === '%') { bytes.push(parseInt(escaped.slice(index + 1, index + 3), 16)); index += 2; }
    else bytes.push(escaped.charCodeAt(index));
  }
  return Uint8Array.from(bytes);
}

export function encodeFlightPlanHandoff(plan: FlightPlan): string { return `ssp-fd:${toBase64Url(serializeFlightPlan(plan))}`; }

export function decodeFlightPlanHandoff(value: string, atSec = 0): FlightPlan | null {
  try {
    if (!value.startsWith('ssp-fd:')) return null;
    const data = JSON.parse(fromBase64Url(value.slice(7))) as Partial<FlightPlan>;
    if (data.version !== FLIGHT_PLAN_VERSION || typeof data.craftId !== 'string' || typeof data.primaryId !== 'string' || !Array.isArray(data.steps)) return null;
    const kinds: FlightStepKind[] = ['nudge', 'circularize', 'match-velocity', 'transfer'];
    const directions: NudgeDirection[] = ['prograde', 'retrograde', 'radial-in', 'radial-out', 'normal', 'anti-normal'];
    const steps: FlightPlanStep[] = data.steps
      .filter((step): step is FlightPlanStep => Boolean(step && typeof step.id === 'string' && step.id.length <= 160 && kinds.includes(step.kind as FlightStepKind) && typeof step.label === 'string'))
      .slice(0, MAX_FLIGHT_PLAN_STEPS)
      .map((step) => {
        const kind = step.kind as FlightStepKind;
        const safe: FlightPlanStep = {
          id: step.id,
          kind,
          label: step.label.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160),
          status: step.status === 'complete' || step.status === 'skipped' ? step.status : 'queued',
        };
        if (kind === 'nudge') {
          safe.direction = directions.includes(step.direction as NudgeDirection) ? step.direction : 'prograde';
          safe.deltaVKmS = Math.max(0.001, Math.min(20, Number.isFinite(step.deltaVKmS) ? Number(step.deltaVKmS) : 0.05));
        }
        if ((kind === 'match-velocity' || kind === 'transfer') && typeof step.targetId === 'string') safe.targetId = step.targetId.slice(0, 160);
        if (kind === 'transfer' && Number.isFinite(step.targetRadiusKm) && Number(step.targetRadiusKm) > 0) safe.targetRadiusKm = Number(step.targetRadiusKm);
        return safe;
      });
    if (steps.length !== Math.min(data.steps.length, MAX_FLIGHT_PLAN_STEPS)) return null;
    return { version: FLIGHT_PLAN_VERSION, id: createId('flight-plan'), title: normalizeFlightPlanTitle(data.title), craftId: data.craftId.slice(0, 160), primaryId: data.primaryId.slice(0, 160), createdAtSec: Math.max(0, Number.isFinite(data.createdAtSec) ? Number(data.createdAtSec) : atSec), steps };
  } catch { return null; }
}

export function appendFlightReplay(log: FlightReplayEntry[], entry: FlightReplayEntry, capacity = 48): FlightReplayEntry[] {
  return [...log, entry].slice(-Math.max(1, capacity));
}

export function replaySummary(log: FlightReplayEntry[], planId: string): { complete: number; rejected: number; skipped: number } {
  return log.filter((entry) => entry.planId === planId).reduce((summary, entry) => ({ ...summary, [entry.result]: summary[entry.result] + 1 }), { complete: 0, rejected: 0, skipped: 0 });
}
