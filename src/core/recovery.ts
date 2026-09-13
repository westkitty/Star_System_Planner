/**
 * Crash-recovery sentinel (BACK08).
 *
 * A heartbeat marks the session dirty whenever planner state mutates; a
 * clean shutdown clears the flag. If boot finds a dirty flag with no
 * clean exit, the UI offers to restore the last autosave instead of
 * silently dropping the session.
 */

const DIRTY_KEY = 'starsilk-planner-recovery-dirty-v1';
const memory: Record<string, string> = {};

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  const s = storage();
  if (s) {
    try {
      return s.getItem(key);
    } catch {
      return null;
    }
  }
  return memory[key] ?? null;
}

function write(key: string, value: string): void {
  const s = storage();
  if (s) {
    try {
      s.setItem(key, value);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memory[key] = value;
}

function remove(key: string): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  delete memory[key];
}

export interface PendingRecovery {
  dirtyAtIso: string;
}

/** Mark the session as holding unsaved-mutation risk. Cheap; call on checkpoints. */
export function markSessionDirty(): void {
  write(DIRTY_KEY, new Date().toISOString());
}

/** Record a clean shutdown (called on beforeunload / orderly exit). */
export function markCleanShutdown(): void {
  remove(DIRTY_KEY);
}

/** Returns pending-recovery info when the last session ended dirty. */
export function checkPendingRecovery(): PendingRecovery | null {
  const raw = read(DIRTY_KEY);
  if (!raw) return null;
  return { dirtyAtIso: raw };
}

/** Dismiss a pending recovery without restoring. */
export function clearPendingRecovery(): void {
  remove(DIRTY_KEY);
}
