/**
 * Discovery codex — a persisted collection of first sightings (iteration 3, GAME07).
 *
 * Eclipses, transits, conjunctions, resonances, captures, and gravity
 * assists are the planner's wildlife. The codex counts repeat sightings and
 * remembers first contact, turning transient sky events into a collection
 * worth completing across sessions.
 */

export type DiscoveryKind = 'eclipse' | 'transit' | 'conjunction' | 'resonance' | 'capture' | 'assist';

export interface CodexEntry {
  kind: DiscoveryKind;
  count: number;
  firstSeenIso: string;
  lastSeenIso: string;
  lastLabel: string;
}

export const DISCOVERY_KINDS: DiscoveryKind[] = [
  'eclipse',
  'transit',
  'conjunction',
  'resonance',
  'capture',
  'assist',
];

export const DISCOVERY_LABELS: Record<DiscoveryKind, string> = {
  eclipse: 'Eclipses',
  transit: 'Transits',
  conjunction: 'Conjunctions',
  resonance: 'Resonances',
  capture: 'Captures',
  assist: 'Gravity assists',
};

const STORAGE_KEY = 'starsilk-codex-v1';

function loadPersisted(): Partial<Record<DiscoveryKind, CodexEntry>> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<DiscoveryKind, CodexEntry>>;
  } catch {
    return {};
  }
}

function persist(entries: Partial<Record<DiscoveryKind, CodexEntry>>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* private mode: the codex lasts the session */
  }
}

export class DiscoveryCodex {
  private entries = new Map<DiscoveryKind, CodexEntry>();

  constructor() {
    const persisted = loadPersisted();
    for (const kind of DISCOVERY_KINDS) {
      const entry = persisted[kind];
      if (entry && typeof entry.count === 'number') this.entries.set(kind, { ...entry });
    }
  }

  /** Record a sighting; returns the updated entry. */
  public record(kind: DiscoveryKind, label: string): CodexEntry {
    const now = new Date().toISOString();
    const prev = this.entries.get(kind);
    const next: CodexEntry = prev
      ? { ...prev, count: prev.count + 1, lastSeenIso: now, lastLabel: label }
      : { kind, count: 1, firstSeenIso: now, lastSeenIso: now, lastLabel: label };
    this.entries.set(kind, next);
    const snapshot: Partial<Record<DiscoveryKind, CodexEntry>> = {};
    for (const [k, v] of this.entries) snapshot[k] = v;
    persist(snapshot);
    return next;
  }

  public list(): CodexEntry[] {
    return DISCOVERY_KINDS.map((k) => this.entries.get(k)).filter((e): e is CodexEntry => Boolean(e));
  }

  public kindsSeen(): number {
    return this.entries.size;
  }

  public totalSightings(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.count;
    return total;
  }

  public reset(): void {
    this.entries.clear();
    persist({});
  }
}

export const discoveryCodex = new DiscoveryCodex();

export function resetCodexForTests(): void {
  discoveryCodex.reset();
}
