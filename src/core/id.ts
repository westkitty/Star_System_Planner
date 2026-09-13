/**
 * Stable unique ID service (BACK06).
 *
 * Replaces collision-prone `Date.now()` / `Math.random()` ID sprinkles with a
 * monotonic, prefixed generator. IDs stay unique within a session and are
 * practically unique across sessions (counter + time + entropy).
 */

let counter = 0;

export function createId(prefix: string): string {
  counter += 1;
  const entropy = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${entropy}`;
}

/** Reset the session counter (tests only). */
export function resetIdCounterForTests(): void {
  counter = 0;
}
