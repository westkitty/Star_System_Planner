/** Clamp animation clock discontinuities before procedural curve sampling.
 * RAF timestamps can be slightly older than performance.now() at construction.
 * Returning a negative elapsed delta sends getPointAt(t<0) outside a curve's domain.
 */
export function frameDelta(now, previous, maxDelta=80) {
  if (!Number.isFinite(now) || !Number.isFinite(previous)) return 0;
  return Math.max(0, Math.min(maxDelta, now-previous));
}

/** Wrap finite cyclic animation phases into the [0,1) curve domain. */
export function wrapCurvePhase(value) {
  if (!Number.isFinite(value)) return 0;
  return ((value%1)+1)%1;
}
