/** Small local-only UI preference envelope; deliberately separate from project saves. */
import type { NudgeDirection } from '../simulation/maneuvers';
import type { StorageLike } from './flight-director-storage';

export const FLIGHT_DIRECTOR_PREFERENCES_VERSION = 1;
export const FLIGHT_DIRECTOR_PREFERENCES_KEY = 'starsilk-flight-director-ui-v1';

export type DirectorSection = 'library' | 'handoff' | 'exports' | 'viewpoints' | 'replay';

export interface FlightDirectorPreferences {
  version: 1;
  open: boolean;
  direction: NudgeDirection;
  magnitudeKmS: number;
  targetId: string;
  sections: Record<DirectorSection, boolean>;
}

export const DEFAULT_FLIGHT_DIRECTOR_PREFERENCES: FlightDirectorPreferences = {
  version: FLIGHT_DIRECTOR_PREFERENCES_VERSION,
  open: false,
  direction: 'prograde',
  magnitudeKmS: 0.05,
  targetId: '',
  sections: { library: false, handoff: false, exports: false, viewpoints: false, replay: true },
};

function browserStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function clampDirectorMagnitude(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Math.max(0.001, Math.min(20, Number.isFinite(numeric) ? numeric : DEFAULT_FLIGHT_DIRECTOR_PREFERENCES.magnitudeKmS));
}

export function normalizeFlightDirectorPreferences(value: unknown): FlightDirectorPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES, sections: { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES.sections } };
  const data = value as Partial<FlightDirectorPreferences>;
  if (data.version !== FLIGHT_DIRECTOR_PREFERENCES_VERSION) return { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES, sections: { ...DEFAULT_FLIGHT_DIRECTOR_PREFERENCES.sections } };
  const directions: NudgeDirection[] = ['prograde', 'retrograde', 'radial-in', 'radial-out', 'normal', 'anti-normal'];
  const rawSections: Partial<Record<DirectorSection, boolean>> = data.sections && typeof data.sections === 'object' ? data.sections : {};
  return {
    version: FLIGHT_DIRECTOR_PREFERENCES_VERSION,
    open: data.open === true,
    direction: directions.includes(data.direction as NudgeDirection) ? data.direction as NudgeDirection : DEFAULT_FLIGHT_DIRECTOR_PREFERENCES.direction,
    magnitudeKmS: clampDirectorMagnitude(data.magnitudeKmS),
    targetId: typeof data.targetId === 'string' ? data.targetId.slice(0, 160) : '',
    sections: {
      library: rawSections.library === true,
      handoff: rawSections.handoff === true,
      exports: rawSections.exports === true,
      viewpoints: rawSections.viewpoints === true,
      replay: rawSections.replay !== false,
    },
  };
}

export function loadFlightDirectorPreferences(storage: StorageLike | null = browserStorage()): FlightDirectorPreferences {
  if (!storage) return normalizeFlightDirectorPreferences(null);
  try {
    const raw = storage.getItem(FLIGHT_DIRECTOR_PREFERENCES_KEY);
    if (!raw || raw.length > 4096) return normalizeFlightDirectorPreferences(null);
    return normalizeFlightDirectorPreferences(JSON.parse(raw));
  } catch { return normalizeFlightDirectorPreferences(null); }
}

export function saveFlightDirectorPreferences(preferences: FlightDirectorPreferences, storage: StorageLike | null = browserStorage()): void {
  try { storage?.setItem(FLIGHT_DIRECTOR_PREFERENCES_KEY, JSON.stringify(normalizeFlightDirectorPreferences(preferences))); } catch { /* storage denial is non-fatal */ }
}
