import { describe, it, expect, beforeEach } from 'vitest';
import { loadUserPrefs, saveUserPrefs, DEFAULT_PREFS } from '../persistence/prefs';

// In-memory localStorage shim for the node test environment
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

describe('User preferences — persisted device posture', () => {
  beforeEach(() => store.clear());

  it('returns defaults when nothing is stored', () => {
    const p = loadUserPrefs();
    expect(p).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a modified preference set', () => {
    const p = { ...DEFAULT_PREFS, showTrails: false, orreryEnabled: true, forecastHorizon: 'deep' as const };
    saveUserPrefs(p);
    const loaded = loadUserPrefs();
    expect(loaded.showTrails).toBe(false);
    expect(loaded.orreryEnabled).toBe(true);
    expect(loaded.forecastHorizon).toBe('deep');
  });

  it('survives corrupt JSON by falling back to defaults', () => {
    store.set('ssp-user-prefs-v1', '{"audioEnabled": tru');
    const p = loadUserPrefs();
    expect(p).toEqual(DEFAULT_PREFS);
  });

  it('clamps out-of-range tunables instead of honoring stored abuse', () => {
    store.set('ssp-user-prefs-v1', JSON.stringify({
      cameraSensitivity: 99,
      trailLengthPoints: -500,
      perturbPercent: 400,
    }));
    const p = loadUserPrefs();
    expect(p.cameraSensitivity).toBeLessThanOrEqual(2.5);
    expect(p.cameraSensitivity).toBeGreaterThanOrEqual(0.4);
    expect(p.trailLengthPoints).toBeGreaterThanOrEqual(0);
    expect(p.trailLengthPoints).toBeLessThanOrEqual(600);
    expect(p.perturbPercent).toBeLessThanOrEqual(5);
  });

  it('ignores unknown keys from older futures gracefully', () => {
    store.set('ssp-user-prefs-v1', JSON.stringify({ hologramMode: true, showTrails: true }));
    const p = loadUserPrefs();
    expect((p as any).hologramMode).toBeUndefined();
    expect(p.showTrails).toBe(true);
  });
});
