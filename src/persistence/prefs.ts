/**
 * Per-Device User Preferences (localStorage).
 *
 * Remembers operator comfort settings independently of any saved project:
 * audio, lenses, interaction sensitivities, onboarding dismissal.
 */

export interface UserPrefs {
  audioEnabled: boolean;
  orreryEnabled: boolean;
  showLabels: boolean;
  showTrails: boolean;
  showHabitableZone: boolean;
  showXRay: boolean;
  showRadar: boolean;
  autoPauseOnCatastrophe: boolean;
  rocheBreaking: boolean;
  cameraSensitivity: number; // multiplier 0.4 - 2.5
  trailLengthPoints: number;
  perturbPercent: number; // sensitivity fan perturbation %
  forecastHorizon: 'near' | 'standard' | 'deep';
  renderQuality: 'auto' | 'high' | 'low';
  seenOnboarding: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_PREFS: UserPrefs = {
  audioEnabled: false,
  orreryEnabled: false,
  showLabels: false,
  showTrails: false,
  showHabitableZone: false,
  showXRay: false,
  showRadar: false,
  autoPauseOnCatastrophe: false,
  rocheBreaking: true,
  cameraSensitivity: 1.0,
  trailLengthPoints: 220,
  perturbPercent: 1.5,
  forecastHorizon: 'standard',
  renderQuality: 'auto',
  seenOnboarding: false,
  reduceMotion: false,
};

const PREFS_KEY = 'ssp-user-prefs-v1';

export function loadUserPrefs(): UserPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PREFS };
    }
    // Only honor keys the current preference schema actually declares —
    // unknown keys from older/future builds are dropped, never merged.
    const merged: UserPrefs = { ...DEFAULT_PREFS };
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof UserPrefs)[]) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        (merged as any)[key] = parsed[key];
      }
    }
    // Defensive clamps
    merged.cameraSensitivity = Math.min(2.5, Math.max(0.4, Number(merged.cameraSensitivity) || 1));
    merged.trailLengthPoints = Math.min(600, Math.max(0, Math.round(Number(merged.trailLengthPoints) || 220)));
    merged.perturbPercent = Math.min(5, Math.max(0.1, Number(merged.perturbPercent) || 1.5));
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage quota - silently degrade */
  }
}
