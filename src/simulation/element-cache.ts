/**
 * Per-tick osculating-element cache (BACK05).
 *
 * The monitor, inspector, orbit lines, and transfer planner all derive
 * Keplerian elements from the same (body, primary, time) triples. This
 * cache computes each triple once per simulation timestamp so repeated
 * passes share the result instead of re-running the solver.
 */

import { CelestialBody, OsculatingElements } from './types';
import { calculateOsculatingElements } from './orbital-mechanics';

const MAX_ENTRIES = 512;
const cache = new Map<string, OsculatingElements | null>();

function keyFor(bodyId: string, primaryId: string, timeSec: number): string {
  return `${bodyId}|${primaryId}|${Math.round(timeSec * 1000)}`;
}

export function getCachedElements(
  body: CelestialBody,
  primary: CelestialBody,
  timeSec: number
): OsculatingElements | null {
  const key = keyFor(body.id, primary.id, timeSec);
  if (cache.has(key)) return cache.get(key) ?? null;
  const elements = calculateOsculatingElements(body, primary);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, elements);
  return elements;
}

export function clearElementCache(): void {
  cache.clear();
}

export function elementCacheSizeForTests(): number {
  return cache.size;
}
