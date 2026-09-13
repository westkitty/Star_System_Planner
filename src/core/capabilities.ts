/**
 * Runtime capability detection (BACK15).
 *
 * Probes WebGL, Web Workers, IndexedDB, and device characteristics at boot
 * so the planner can gate startup, degrade gracefully, and explain exactly
 * which subsystem is unavailable instead of failing obscurely.
 */

export interface CapabilityReport {
  webgl2: boolean;
  webgl1: boolean;
  workers: boolean;
  indexedDb: boolean;
  localStorage: boolean;
  audioContext: boolean;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  touchPoints: number;
  prefersReducedMotion: boolean;
  summary: 'full' | 'degraded' | 'blocked';
  blockers: string[];
  warnings: string[];
}

function probeWebgl(version: 1 | 2): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const ctx =
      version === 2
        ? canvas.getContext('webgl2')
        : canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return ctx !== null;
  } catch {
    return false;
  }
}

function probeLocalStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const key = '__starsilk_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function detectCapabilities(): CapabilityReport {
  const webgl2 = probeWebgl(2);
  const webgl1 = webgl2 || probeWebgl(1);
  const workers = typeof Worker !== 'undefined';
  const indexedDb = typeof indexedDB !== 'undefined';
  const localStorageOk = probeLocalStorage();
  const audioContext =
    typeof AudioContext !== 'undefined' ||
    typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';

  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const deviceMemoryGb =
    typeof (nav as unknown as { deviceMemory?: number }).deviceMemory === 'number'
      ? (nav as unknown as { deviceMemory: number }).deviceMemory
      : null;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!webgl1) blockers.push('WebGL unavailable — 3D viewport cannot initialize.');
  if (!workers) warnings.push('Web Workers unavailable — trajectory forecasts run on the main thread.');
  if (!indexedDb) warnings.push('IndexedDB unavailable — autosave disabled; use .ssp.json export.');
  if (!localStorageOk) warnings.push('Local storage unavailable — settings will not persist.');
  if (!audioContext) warnings.push('Web Audio unavailable — tactile audio disabled.');
  if (deviceMemoryGb !== null && deviceMemoryGb <= 4) {
    warnings.push('Low-memory device detected — auto quality scaling engaged.');
  }

  const summary: CapabilityReport['summary'] = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'full';

  return {
    webgl2,
    webgl1,
    workers,
    indexedDb,
    localStorage: localStorageOk,
    audioContext,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    hardwareConcurrency: nav.hardwareConcurrency || 4,
    deviceMemoryGb,
    touchPoints: nav.maxTouchPoints || 0,
    prefersReducedMotion,
    summary,
    blockers,
    warnings,
  };
}
