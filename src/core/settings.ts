/**
 * Persistent user settings store (supports UI15 settings modal).
 *
 * localStorage-backed with in-memory fallback for headless/test runtimes.
 * Changes broadcast through the event bus so audio, renderer, and HUD stay
 * synchronized without prop drilling.
 */

import { eventBus } from './event-bus';

export const SETTINGS_SCHEMA_VERSION = 2;

export type UnitSystem = 'metric' | 'imperial';

export interface PlannerSettings {
  settingsVersion: number;
  audioVolume: number; // 0..1
  audioEnabled: boolean;
  autosaveEnabled: boolean;
  reducedMotion: boolean;
  trajectoryPoints: number; // max rendered forecast points per body
  showHudHints: boolean;
  navigatorVisible: boolean;
  followOnSelect: boolean;
  onboardingCompleted: boolean;
  // Iteration 2 additions (schema v2).
  bookmarkedBodyIds: string[];
  velocityVectorsVisible: boolean;
  bodyLabelsVisible: boolean;
  auRulerVisible: boolean;
  orbitLinesVisible: boolean;
  approachAutopilot: boolean;
  unitSystem: UnitSystem;
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  settingsVersion: SETTINGS_SCHEMA_VERSION,
  audioVolume: 0.8,
  audioEnabled: false,
  autosaveEnabled: true,
  reducedMotion: false,
  trajectoryPoints: 500,
  showHudHints: true,
  navigatorVisible: true,
  followOnSelect: false,
  bookmarkedBodyIds: [],
  velocityVectorsVisible: false,
  bodyLabelsVisible: true,
  auRulerVisible: false,
  orbitLinesVisible: true,
  approachAutopilot: true,
  unitSystem: 'metric',
  onboardingCompleted: false,
};

const STORAGE_KEY = 'starsilk-planner-settings-v1';
const memoryFallback: Record<string, string> = {};

function readRaw(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(STORAGE_KEY);
  } catch {
    /* fall through to memory */
  }
  return memoryFallback[STORAGE_KEY] ?? null;
}

function writeRaw(value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value);
      return;
    }
  } catch {
    /* fall through to memory */
  }
  memoryFallback[STORAGE_KEY] = value;
}

class SettingsStore {
  private settings: PlannerSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.load();
  }

  public load(): PlannerSettings {
    try {
      const raw = readRaw();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlannerSettings>;
        this.settings = migrateSettings(parsed);
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    // Honor OS-level reduced-motion preference on first run.
    if (
      !readRaw() &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      this.settings.reducedMotion = true;
    }
    return this.get();
  }

  public get(): PlannerSettings {
    return { ...this.settings };
  }

  public update(patch: Partial<PlannerSettings>): PlannerSettings {
    this.settings = { ...this.settings, ...patch };
    writeRaw(JSON.stringify(this.settings));
    eventBus.emit('project:saved', { kind: 'settings', settings: this.get() });
    return this.get();
  }

  public reset(): PlannerSettings {
    this.settings = { ...DEFAULT_SETTINGS };
    writeRaw(JSON.stringify(this.settings));
    return this.get();
  }
}

/**
 * Versioned settings migration (BACK09). Unversioned payloads are v1;
 * each step layers new defaults without dropping unknown future keys.
 */
export function migrateSettings(parsed: Partial<PlannerSettings>): PlannerSettings {
  const version = parsed.settingsVersion ?? 1;
  if (version <= 1) {
    const { settingsVersion: _ignored, ...rest } = parsed;
    void _ignored;
    return { ...DEFAULT_SETTINGS, ...rest, settingsVersion: SETTINGS_SCHEMA_VERSION };
  }
  return { ...DEFAULT_SETTINGS, ...parsed, settingsVersion: SETTINGS_SCHEMA_VERSION };
}

export function settingsSchemaVersionForTests(): number {
  return SETTINGS_SCHEMA_VERSION;
}

export const settingsStore = new SettingsStore();
