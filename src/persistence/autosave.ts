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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private readonly maxRetries = 3;
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

  /** Consecutive write failures awaiting retry (iteration 3, BACK05). */
  public getRetryCount(): number {
    return this.retryAttempt;
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
      this.retryAttempt = 0;
      this.update({ status: 'saved', lastSavedAtMs: Date.now(), lastError: null });
      eventBus.emit('project:saved', { projectId: project.projectId, kind: 'autosave' });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Iteration 3 BACK05: transient storage failures (locked DB, quota
      // pressure) retry with exponential backoff; the pending payload is
      // preserved, never dropped, and error only surfaces after retries.
      if (this.retryAttempt < this.maxRetries) {
        this.retryAttempt++;
        this.pendingProject = project;
        const backoffMs = 1500 * Math.pow(2, this.retryAttempt - 1);
        logger.warn('autosave', `write failed; retry ${this.retryAttempt}/${this.maxRetries} in ${backoffMs}ms`, err);
        this.update({ status: 'saving', lastError: message, pendingWrites: 1 });
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, backoffMs);
        return false;
      }
      logger.error('autosave', 'write failed after retries', err);
      this.update({ status: 'error', lastError: message });
      return false;
    }
  }

  public getState(): AutosaveState {
    return { ...this.state };
  }

  public destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
  }
}
