/**
 * Destructive-action undo stack (GAME08).
 *
 * Captures snapshots before deletions, macro consequences, and preset
 * loads so a single Ctrl+Z (or the toast action) restores the exact prior
 * system state, including events and destruction flags.
 */

import { CelestialBody, ConsequenceEvent, SystemStatus } from './types';
import { SimulationEngine } from './engine';

export type UndoKind = 'delete-body' | 'macro' | 'preset-load' | 'bulk' | 'merge' | 'time-scrub';

export interface UndoEntry {
  id: string;
  kind: UndoKind;
  label: string;
  atMs: number;
  bodies: CelestialBody[];
  events: ConsequenceEvent[];
  systemStatus: SystemStatus;
  timeSec: number;
}

const MAX_ENTRIES = 25;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class UndoStack {
  private entries: UndoEntry[] = [];
  private listeners = new Set<(depth: number) => void>();

  public subscribe(listener: (depth: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.entries.length);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.entries.length);
      } catch {
        /* listener errors must never break undo */
      }
    }
  }

  public depth(): number {
    return this.entries.length;
  }

  public peek(): UndoEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  /** Capture pre-action state. Call BEFORE the destructive mutation. */
  public checkpoint(engine: SimulationEngine, kind: UndoKind, label: string): UndoEntry {
    const entry: UndoEntry = {
      id: `undo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      kind,
      label,
      atMs: Date.now(),
      bodies: deepClone(engine.bodies),
      events: deepClone(engine.events),
      systemStatus: engine.systemStatus,
      timeSec: engine.timeSec,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.notify();
    return entry;
  }

  /** Restore the most recent checkpoint into the live engine. */
  public undo(engine: SimulationEngine): UndoEntry | null {
    const entry = this.entries.pop();
    if (!entry) return null;
    engine.bodies = deepClone(entry.bodies);
    engine.events = deepClone(entry.events);
    engine.systemStatus = entry.systemStatus;
    engine.timeSec = entry.timeSec;
    engine.events.push({
      id: `undo-${Date.now()}`,
      timestampSec: engine.timeSec,
      type: 'body_created',
      title: `Undone: ${entry.label}`,
      description: `Restored system state captured before "${entry.label}".`,
      severity: 'info',
    });
    this.notify();
    return entry;
  }

  public clear(): void {
    this.entries = [];
    this.notify();
  }
}
