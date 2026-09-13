/**
 * Timed snapshot ring buffer (BACK02).
 *
 * Records engine states at fixed simulation-time intervals so the timeline
 * scrubber can rewind recent history. Bounded, allocation-cheap on the
 * hot path (records only when due), and restorable through the engine's
 * existing snapshot pipeline.
 */

import { CelestialBody } from './types';

export interface BufferedSnapshot {
  timeSec: number;
  bodies: CelestialBody[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SnapshotBuffer {
  private entries: BufferedSnapshot[] = [];
  private lastRecordedTimeSec = Number.NEGATIVE_INFINITY;

  constructor(
    public capacity = 60,
    public intervalSec = 5
  ) {}

  public get size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries = [];
    this.lastRecordedTimeSec = Number.NEGATIVE_INFINITY;
  }

  /** Record the current state when the interval has elapsed. Returns true when captured. */
  public recordIfDue(timeSec: number, bodies: CelestialBody[]): boolean {
    if (timeSec - this.lastRecordedTimeSec < this.intervalSec) return false;
    this.lastRecordedTimeSec = timeSec;
    this.entries.push({ timeSec, bodies: clone(bodies) });
    while (this.entries.length > this.capacity) this.entries.shift();
    return true;
  }

  public at(index: number): BufferedSnapshot | null {
    if (index < 0 || index >= this.entries.length) return null;
    return this.entries[index];
  }

  /** Newest entry at or before `timeSec` (for scrub targeting). */
  public nearestAtOrBefore(timeSec: number): BufferedSnapshot | null {
    let best: BufferedSnapshot | null = null;
    for (const e of this.entries) {
      if (e.timeSec <= timeSec) best = e;
      else break;
    }
    return best;
  }

  public oldestTimeSec(): number | null {
    return this.entries.length > 0 ? this.entries[0].timeSec : null;
  }

  public newestTimeSec(): number | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].timeSec : null;
  }
}
