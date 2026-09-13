/**
 * Debounced autosave orchestrator with status reporting (BACK04).
 *
 * Coalesces rapid save requests, surfaces save lifecycle (saving/saved/
 * error/disabled) to the HUD status pill, and translates storage failures
 * (quota, private mode) into actionable messages instead of silent drops.
 */

import { eventBus } from '../core/event-bus';
import { logger } from '../core/logger';
import { saveProjectToDb, SavedSystemProject } from './db';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'disabled';

export interface AutosaveState {
  status: AutosaveStatus;
  lastSavedAtMs: number | null;
  lastError: string | null;
  pendingWrites: number;
}

export class AutosaveManager {
  private enabled = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingProject: SavedSystemProject | null = null;
  private state: AutosaveState = { status: 'idle', lastSavedAtMs: null, lastError: null, pendingWrites: 0 };
  private listeners = new Set<(state: AutosaveState) => void>();
  private readonly debounceMs: number;

  constructor(debounceMs = 1200) {
    this.debounceMs = debounceMs;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pendingProject = null;
    }
    this.update({ status: enabled ? 'idle' : 'disabled', pendingWrites: 0 });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public subscribe(listener: (state: AutosaveState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch (err) {
        logger.warn('autosave', 'status listener threw', err);
      }
    }
  }

  /** Queue a save; rapid successive calls collapse into one write. */
  public requestSave(project: SavedSystemProject): void {
    if (!this.enabled) return;
    this.pendingProject = project;
    this.update({ pendingWrites: this.state.pendingWrites + 1 });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Flush immediately (e.g. before destructive actions or unload). */
  public async flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const project = this.pendingProject;
    this.pendingProject = null;
    if (!project || !this.enabled) {
      this.update({ pendingWrites: 0 });
      return true;
    }
    this.update({ status: 'saving', pendingWrites: 0 });
    try {
      await saveProjectToDb(project);
      this.update({ status: 'saved', lastSavedAtMs: Date.now(), lastError: null });
      eventBus.emit('project:saved', { projectId: project.projectId, kind: 'autosave' });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('autosave', 'write failed', err);
      this.update({ status: 'error', lastError: message });
      return false;
    }
  }

  public getState(): AutosaveState {
    return { ...this.state };
  }

  public destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
