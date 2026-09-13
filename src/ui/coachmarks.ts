/**
 * First-use tool coachmarks (UI07).
 *
 * The welcome tour covers the map; coachmarks cover the moment — a single
 * contextual card the first time each deep tool is armed (grab, loom,
 * fork, macro), then never again. Dismissals persist independently of
 * the onboarding tour.
 */

export type CoachmarkId = 'grab' | 'loom' | 'fork' | 'macro' | 'transfer';

export const COACHMARK_COPY: Record<CoachmarkId, { title: string; body: string }> = {
  grab: {
    title: 'Grab & throw armed',
    body: 'Drag any world to reposition it, or fling it to inject velocity. The azure vector previews your throw — release to commit.',
  },
  loom: {
    title: 'Orbit loom armed',
    body: 'Sketch a loop around a star to fit a conic. Drag the diamond handles to tune periapsis and apoapsis before forging.',
  },
  fork: {
    title: 'Fork the future',
    body: 'Name this alternate timeline. It snapshots the live state and diverges from here — compare branches any time.',
  },
  macro: {
    title: 'Canon macros are live ordnance',
    body: 'Each macro rewrites the system irreversibly. Hold to confirm, and check the ledger to audit the consequences.',
  },
  transfer: {
    title: 'Hohmann transfers',
    body: 'Pick a destination orbit to preview Δv and coast time. Execute the departure burn, then circularize at arrival.',
  },
};

const STORAGE_KEY = 'starsilk-coachmarks-v1';

function loadSeen(): Record<string, boolean> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, boolean>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

export function shouldShowCoachmark(id: CoachmarkId): boolean {
  return !loadSeen()[id];
}

export function dismissCoachmark(id: CoachmarkId): void {
  const seen = loadSeen();
  seen[id] = true;
  saveSeen(seen);
}

export function resetCoachmarksForTests(): void {
  saveSeen({});
}
