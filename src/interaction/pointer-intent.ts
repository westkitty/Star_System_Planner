/**
 * Authoritative Tablet & Pointer Intent Resolver.
 * 
 * Target Interaction Principle:
 * S PEN CONSTRUCTS. FINGERS NAVIGATE. MOUSE PERFORMS DESKTOP FALLBACK.
 * 
 * Governs:
 * - Orbit Loom drawing: Pen and mouse construct; touch navigates camera (never draws).
 * - Grab & Throw manipulation: Pen and mouse manipulate; touch selects without dragging.
 * - Multi-touch gestures: Strictly navigation (pinch zoom, two-finger pan).
 * - Selection & void taps: All modalities can select/deselect.
 */

export type PointerToolMode = 'select' | 'grab_throw' | 'orbit_loom' | 'create';

export type PointerIntentAction =
  | 'orbit_loom_draw'
  | 'grab_throw_manipulate'
  | 'select_body'
  | 'deselect'
  | 'camera_navigate';

export interface PointerIntentContext {
  tool: PointerToolMode;
  pointerType: 'mouse' | 'pen' | 'touch';
  hasHitBody: boolean;
  isPaused?: boolean;
  pointerCount?: number;
}

export function resolvePointerIntent(ctx: PointerIntentContext): PointerIntentAction {
  const { tool, pointerType, hasHitBody, isPaused, pointerCount = 1 } = ctx;

  // Multi-touch gestures (two or more fingers) are strictly camera navigation
  if (pointerCount > 1) {
    return 'camera_navigate';
  }

  // 1. ORBIT LOOM:
  // S PEN CONSTRUCTS. MOUSE FALLBACK CONSTRUCTS.
  // FINGERS NAVIGATE (Touch must NEVER start orbit loom drawing).
  if (tool === 'orbit_loom') {
    if (pointerType === 'pen' || pointerType === 'mouse') {
      return 'orbit_loom_draw';
    }
    // Finger touch on canvas while LOOM is active is camera navigation
    return 'camera_navigate';
  }

  // 2. GRAB & THROW (or paused object manipulation):
  // Pen and Mouse manipulate bodies.
  // Touch does NOT start grab/throw manipulation to prevent accidental trajectory mutations during navigation.
  if (hasHitBody) {
    if ((tool === 'grab_throw' || isPaused) && (pointerType === 'pen' || pointerType === 'mouse')) {
      return 'grab_throw_manipulate';
    }
    // Any pointer type can select a body for inspection
    return 'select_body';
  }

  // 3. SELECT TOOL VOID TAP:
  if (tool === 'select') {
    return 'deselect';
  }

  // Default fallback is camera navigation
  return 'camera_navigate';
}
