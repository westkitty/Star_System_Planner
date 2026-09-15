/** Versioned, local-only persistence and portable codecs for Flight Director. */
import { createId } from '../core/id';
import { CameraViewpoint, normalizeCameraViewpoint } from '../rendering/scene-manager';
import {
  FLIGHT_PLAN_VERSION,
  FlightPlan,
  FlightPlanStep,
  FlightReplayEntry,
  MAX_FLIGHT_PLAN_STEPS,
  buildFlightBrief,
  decodeFlightPlanHandoff,
  encodeFlightPlanHandoff,
  flightPlanDigest,
  normalizeFlightPlanTitle,
  serializeFlightPlan,
} from '../simulation/flight-director';
import { CelestialBody } from '../simulation/types';

export const FLIGHT_DIRECTOR_STORAGE_VERSION = 1;
export const FLIGHT_DIRECTOR_STORAGE_KEY = 'starsilk-flight-director-v1';
export const FLIGHT_LIBRARY_STORAGE_KEY = 'starsilk-flight-library-v1';
export const VIEWPOINT_SHELF_STORAGE_KEY = 'starsilk-viewpoint-shelf-v1';
export const MAX_SAVED_FLIGHT_PLANS = 10;
export const MAX_VIEWPOINT_SHELF = 8;
export const MAX_FLIGHT_REPLAY_ENTRIES = 48;
export const MAX_SESSION_CAPSULE_CHARS = 96_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedFlightPlan {
  id: string;
  name: string;
  savedAtIso: string;
  plan: FlightPlan;
}

export interface SavedViewpoint {
  id: string;
  name: string;
  capturedAtIso: string;
  viewpoint: CameraViewpoint;
}

export interface FlightDirectorState {
  activePlan: FlightPlan | null;
  replay: FlightReplayEntry[];
}

export interface FlightSessionCapsule {
  plan: FlightPlan;
  viewpoint: CameraViewpoint | null;
}

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function safeString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function clonePlan(plan: FlightPlan): FlightPlan {
  return { ...plan, steps: plan.steps.map((step) => ({ ...step })) };
}

function sanitizeStep(value: unknown, freshId = false): FlightPlanStep | null {
  if (!value || typeof value !== 'object') return null;
  const step = value as Partial<FlightPlanStep>;
  const kinds = ['nudge', 'circularize', 'match-velocity', 'transfer'] as const;
  if (!kinds.includes(step.kind as typeof kinds[number]) || typeof step.label !== 'string') return null;
  const id = freshId ? createId('flight-step') : safeString(step.id, 160);
  if (!id) return null;
  const status = step.status === 'complete' || step.status === 'skipped' ? step.status : 'queued';
  const clean: FlightPlanStep = { id, kind: step.kind as FlightPlanStep['kind'], label: step.label.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160), status };
  if (clean.kind === 'nudge') {
    const directions = ['prograde', 'retrograde', 'radial-in', 'radial-out', 'normal', 'anti-normal'] as const;
    clean.direction = directions.includes(step.direction as typeof directions[number]) ? step.direction : 'prograde';
    clean.deltaVKmS = Math.max(0.001, Math.min(20, Number.isFinite(step.deltaVKmS) ? Number(step.deltaVKmS) : 0.05));
  }
  if ((clean.kind === 'match-velocity' || clean.kind === 'transfer') && typeof step.targetId === 'string') clean.targetId = step.targetId.slice(0, 160);
  if (clean.kind === 'transfer' && Number.isFinite(step.targetRadiusKm) && Number(step.targetRadiusKm) > 0) clean.targetRadiusKm = Number(step.targetRadiusKm);
  return clean;
}

export function sanitizeStoredFlightPlan(value: unknown, freshIds = false): FlightPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<FlightPlan>;
  const id = freshIds ? createId('flight-plan') : safeString(plan.id, 160);
  const craftId = safeString(plan.craftId, 160);
  const primaryId = safeString(plan.primaryId, 160);
  if (plan.version !== FLIGHT_PLAN_VERSION || !id || !craftId || !primaryId || !Array.isArray(plan.steps) || plan.steps.length > MAX_FLIGHT_PLAN_STEPS) return null;
  const steps = plan.steps.map((step) => sanitizeStep(step, freshIds));
  if (steps.some((step) => !step)) return null;
  return {
    version: FLIGHT_PLAN_VERSION,
    id,
    title: normalizeFlightPlanTitle(plan.title),
    craftId,
    primaryId,
    createdAtSec: Math.max(0, Number.isFinite(plan.createdAtSec) ? Number(plan.createdAtSec) : 0),
    steps: steps as FlightPlanStep[],
  };
}

function sanitizeReplay(value: unknown): FlightReplayEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): FlightReplayEntry[] => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Partial<FlightReplayEntry>;
    const planId = safeString(entry.planId, 160); const stepId = safeString(entry.stepId, 160);
    if (!planId || !stepId || typeof entry.label !== 'string' || typeof entry.detail !== 'string' || !['complete', 'skipped', 'rejected'].includes(String(entry.result))) return [];
    return [{ planId, stepId, atSec: Math.max(0, Number.isFinite(entry.atSec) ? Number(entry.atSec) : 0), label: entry.label.slice(0, 160), result: entry.result as FlightReplayEntry['result'], detail: entry.detail.slice(0, 500) }];
  }).slice(-MAX_FLIGHT_REPLAY_ENTRIES);
}

export function loadFlightDirectorState(storage: StorageLike | null = browserStorage()): FlightDirectorState {
  if (!storage) return { activePlan: null, replay: [] };
  try {
    const raw = storage.getItem(FLIGHT_DIRECTOR_STORAGE_KEY);
    if (!raw || raw.length > MAX_SESSION_CAPSULE_CHARS * 2) return { activePlan: null, replay: [] };
    const data = JSON.parse(raw) as { version?: number; activePlan?: unknown; replay?: unknown };
    if (data.version !== FLIGHT_DIRECTOR_STORAGE_VERSION) return { activePlan: null, replay: [] };
    return { activePlan: data.activePlan == null ? null : sanitizeStoredFlightPlan(data.activePlan), replay: sanitizeReplay(data.replay) };
  } catch { return { activePlan: null, replay: [] }; }
}

export function saveFlightDirectorState(activePlan: FlightPlan | null, replay: FlightReplayEntry[], storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  try {
    const plan = activePlan ? sanitizeStoredFlightPlan(activePlan) : null;
    storage.setItem(FLIGHT_DIRECTOR_STORAGE_KEY, JSON.stringify({ version: FLIGHT_DIRECTOR_STORAGE_VERSION, activePlan: plan, replay: sanitizeReplay(replay) }));
  } catch { /* unavailable or quota-limited storage degrades safely */ }
}

export function listSavedFlightPlans(storage: StorageLike | null = browserStorage()): SavedFlightPlan[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FLIGHT_LIBRARY_STORAGE_KEY);
    if (!raw || raw.length > MAX_SESSION_CAPSULE_CHARS * 4) return [];
    const data = JSON.parse(raw) as { version?: number; entries?: unknown[] };
    if (data.version !== FLIGHT_DIRECTOR_STORAGE_VERSION || !Array.isArray(data.entries)) return [];
    return data.entries.flatMap((raw): SavedFlightPlan[] => {
      if (!raw || typeof raw !== 'object') return [];
      const entry = raw as Partial<SavedFlightPlan>;
      const id = safeString(entry.id, 160); const plan = sanitizeStoredFlightPlan(entry.plan);
      if (!id || !plan) return [];
      return [{ id, name: normalizeFlightPlanTitle(entry.name, 'Saved flight plan'), savedAtIso: typeof entry.savedAtIso === 'string' ? entry.savedAtIso : '', plan }];
    }).slice(-MAX_SAVED_FLIGHT_PLANS).map((entry) => ({ ...entry, plan: clonePlan(entry.plan) }));
  } catch { return []; }
}

function writeLibrary(entries: SavedFlightPlan[], storage: StorageLike | null): SavedFlightPlan[] {
  const bounded = entries.slice(-MAX_SAVED_FLIGHT_PLANS).map((entry) => ({ ...entry, plan: clonePlan(entry.plan) }));
  try { storage?.setItem(FLIGHT_LIBRARY_STORAGE_KEY, JSON.stringify({ version: FLIGHT_DIRECTOR_STORAGE_VERSION, entries: bounded })); } catch { /* safe degradation */ }
  return bounded.map((entry) => ({ ...entry, plan: clonePlan(entry.plan) }));
}

export function saveFlightPlanToLibrary(plan: FlightPlan, name: string, storage: StorageLike | null = browserStorage(), nowIso = new Date().toISOString()): SavedFlightPlan[] {
  const clean = sanitizeStoredFlightPlan(plan);
  if (!clean) return listSavedFlightPlans(storage);
  return writeLibrary([...listSavedFlightPlans(storage), { id: createId('saved-flight'), name: normalizeFlightPlanTitle(name, clean.title), savedAtIso: nowIso, plan: clean }], storage);
}

export function loadFlightPlanFromLibrary(id: string, storage: StorageLike | null = browserStorage()): FlightPlan | null {
  const plan = listSavedFlightPlans(storage).find((entry) => entry.id === id)?.plan;
  return plan ? clonePlan(plan) : null;
}

export function deleteFlightPlanFromLibrary(id: string, storage: StorageLike | null = browserStorage()): SavedFlightPlan[] {
  return writeLibrary(listSavedFlightPlans(storage).filter((entry) => entry.id !== id), storage);
}

export function duplicateFlightPlan(plan: FlightPlan, atSec = plan.createdAtSec): FlightPlan | null {
  const duplicate = sanitizeStoredFlightPlan(plan, true);
  if (!duplicate) return null;
  return { ...duplicate, title: normalizeFlightPlanTitle(`${plan.title} copy`), createdAtSec: Math.max(0, Number.isFinite(atSec) ? atSec : 0), steps: duplicate.steps.map((step) => ({ ...step, status: 'queued' })) };
}

function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  const escaped = encodeURIComponent(value); const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index++) {
    if (escaped[index] === '%') { bytes.push(parseInt(escaped.slice(index + 1, index + 3), 16)); index += 2; }
    else bytes.push(escaped.charCodeAt(index));
  }
  return Uint8Array.from(bytes);
}
function utf8Decode(value: Uint8Array): string {
  return typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }).decode(value) : decodeURIComponent(Array.from(value, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
}
function base64UrlEncode(value: string): string {
  let binary = ''; for (const byte of utf8Encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(value: string): string {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return utf8Decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

export function encodeFlightSessionCapsule(plan: FlightPlan, viewpoint?: CameraViewpoint | null): string | null {
  const cleanPlan = sanitizeStoredFlightPlan(plan);
  const cleanViewpoint = viewpoint == null ? null : normalizeCameraViewpoint(viewpoint);
  if (!cleanPlan || (viewpoint != null && !cleanViewpoint)) return null;
  const encoded = `ssp-session:${base64UrlEncode(JSON.stringify({ version: 1, plan: JSON.parse(serializeFlightPlan(cleanPlan)), viewpoint: cleanViewpoint }))}`;
  return encoded.length <= MAX_SESSION_CAPSULE_CHARS ? encoded : null;
}

export function decodeFlightSessionCapsule(value: string, atSec = 0): FlightSessionCapsule | null {
  try {
    if (!value.startsWith('ssp-session:') || value.length > MAX_SESSION_CAPSULE_CHARS) return null;
    const data = JSON.parse(base64UrlDecode(value.slice(12))) as { version?: number; plan?: unknown; viewpoint?: unknown };
    if (data.version !== 1) return null;
    const plan = sanitizeStoredFlightPlan({ ...(data.plan as object), id: createId('flight-plan') }, true);
    const viewpoint = data.viewpoint == null ? null : normalizeCameraViewpoint(data.viewpoint);
    if (!plan || (data.viewpoint != null && !viewpoint)) return null;
    plan.createdAtSec = Math.max(0, Number.isFinite(plan.createdAtSec) ? plan.createdAtSec : atSec);
    return { plan, viewpoint };
  } catch { return null; }
}

export function createFlightHandoffUrl(handoff: string, location: Pick<Location, 'origin' | 'pathname' | 'search'>): string | null {
  if (!decodeFlightPlanHandoff(handoff)) return null;
  return `${location.origin}${location.pathname}${location.search}#flight=${encodeURIComponent(handoff)}`;
}

export function parseFlightHandoffFragment(fragment: string): string | null {
  try {
    const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
    const code = new URLSearchParams(raw).get('flight');
    return code && decodeFlightPlanHandoff(code) ? code : null;
  } catch { return null; }
}

export function flightPlanJson(plan: FlightPlan): string { return JSON.stringify(JSON.parse(serializeFlightPlan(plan)), null, 2); }
function csvCell(value: unknown): string { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
export function flightReplayCsv(replay: FlightReplayEntry[], planId: string): string {
  return ['plan_id,step_id,at_sec,result,label,detail', ...sanitizeReplay(replay).filter((entry) => entry.planId === planId).map((entry) => [entry.planId, entry.stepId, entry.atSec, entry.result, entry.label, entry.detail].map(csvCell).join(','))].join('\n');
}
export function flightPreflightReport(plan: FlightPlan, bodies: CelestialBody[]): string {
  const brief = buildFlightBrief(plan, bodies);
  return [`Flight Director Preflight`, `Risk: ${brief.risk.toUpperCase()}`, `Craft ID: ${plan.craftId}`, `Primary ID: ${plan.primaryId}`, `Estimated total delta-v: ${brief.totalDeltaVKmS.toFixed(3)} km/s`, `Fingerprint: ${flightPlanDigest(plan)}`, `Issues: ${brief.issues.length ? brief.issues.map((issue) => `[${issue.severity}] ${issue.code}: ${issue.message}`).join(' | ') : 'None'}`].join('\n');
}

export function listViewpointShelf(storage: StorageLike | null = browserStorage()): SavedViewpoint[] {
  if (!storage) return [];
  try {
    const data = JSON.parse(storage.getItem(VIEWPOINT_SHELF_STORAGE_KEY) ?? 'null') as { version?: number; entries?: unknown[] } | null;
    if (data?.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries.flatMap((raw): SavedViewpoint[] => {
      if (!raw || typeof raw !== 'object') return [];
      const entry = raw as Partial<SavedViewpoint>; const id = safeString(entry.id, 160); const viewpoint = normalizeCameraViewpoint(entry.viewpoint);
      return id && viewpoint ? [{ id, name: normalizeFlightPlanTitle(entry.name, 'Viewpoint'), capturedAtIso: typeof entry.capturedAtIso === 'string' ? entry.capturedAtIso : '', viewpoint }] : [];
    }).slice(-MAX_VIEWPOINT_SHELF);
  } catch { return []; }
}

export function saveViewpointToShelf(viewpoint: CameraViewpoint, name: string, storage: StorageLike | null = browserStorage(), nowIso = new Date().toISOString()): SavedViewpoint[] {
  const clean = normalizeCameraViewpoint(viewpoint); if (!clean) return listViewpointShelf(storage);
  const entries = [...listViewpointShelf(storage), { id: createId('viewpoint'), name: normalizeFlightPlanTitle(name, 'Viewpoint'), capturedAtIso: nowIso, viewpoint: clean }].slice(-MAX_VIEWPOINT_SHELF);
  try { storage?.setItem(VIEWPOINT_SHELF_STORAGE_KEY, JSON.stringify({ version: 1, entries })); } catch { /* safe degradation */ }
  return entries;
}

export function cycleViewpointShelf(entries: SavedViewpoint[], currentIndex: number, direction: -1 | 1): { entry: SavedViewpoint; index: number } | null {
  if (!entries.length) return null;
  const base = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < entries.length ? currentIndex : (direction > 0 ? -1 : 0);
  const index = (base + direction + entries.length) % entries.length;
  return { entry: entries[index], index };
}

export function flightPlanHandoff(plan: FlightPlan): string { return encodeFlightPlanHandoff(plan); }
