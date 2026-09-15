/**
 * Tablet & Pointer Interaction Manager.
 * 
 * Supports:
 * - Differentiating S Pen ('pen') from finger ('touch') and mouse ('mouse')
 * - S Pen precision priority for drawing and manipulation
 * - Multi-touch finger pinch-to-zoom and two-finger pan
 * - Camera isolation: Camera movement is strictly suppressed during active body drag or drawing
 */

export type PointerToolMode = 'select' | 'grab_throw' | 'orbit_loom' | 'create';

export interface NormalizedPointerEvent {
  pointerId: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  pressure: number;
  isPrimary: boolean;
  rawEvent: PointerEvent;
}

export interface PointerCallbacks {
  onPointerDown: (e: NormalizedPointerEvent) => void;
  onPointerMove: (e: NormalizedPointerEvent) => void;
  onPointerUp: (e: NormalizedPointerEvent) => void;
  onPointerCancel: (e: NormalizedPointerEvent) => void;
  onPinchZoom: (factor: number) => void;
  onTwoFingerPan: (dx: number, dy: number) => void;
  /** Mouse/trackpad wheel zoom request (raw deltaY). */
  onWheelZoom?: (rawDeltaY: number) => void;
  /** Rapid double-tap / double-click on the canvas. */
  onDoubleTap?: (e: NormalizedPointerEvent) => void;
  /** S Pen barrel-button press — quick manipulation shortcut. */
  onPenQuickAction?: (e: NormalizedPointerEvent) => void;
}

export class PointerManager {
  private element: HTMLElement;
  private callbacks: PointerCallbacks;

  // Active pointers tracker
  private activePointers: Map<number, NormalizedPointerEvent> = new Map();
  private prevPositions: Map<number, { clientX: number; clientY: number }> = new Map();

  // Multi-touch tracking
  private prevPinchDistance: number | null = null;
  private prevPinchCenter: { x: number; y: number } | null = null;

  // Suppression flags
  public isManipulatingObject: boolean = false;
  public isDrawingOrbit: boolean = false;

  // Double-tap detection (screen-space, modality-agnostic)
  private lastTapTimeMs = 0;
  private lastTapPos: { x: number; y: number } | null = null;

  constructor(element: HTMLElement, callbacks: PointerCallbacks) {
    this.element = element;
    this.callbacks = callbacks;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
    this.element.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  public destroy(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
    this.element.removeEventListener('wheel', this.handleWheel);
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.callbacks.onWheelZoom?.(e.deltaY);
  };

  private normalize(e: PointerEvent, deltaX: number = 0, deltaY: number = 0): NormalizedPointerEvent {
    return {
      pointerId: e.pointerId,
      pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
      clientX: e.clientX,
      clientY: e.clientY,
      deltaX,
      deltaY,
      pressure: e.pressure,
      isPrimary: e.isPrimary,
      rawEvent: e,
    };
  }

  public getActivePointerCount(): number {
    return this.activePointers.size;
  }

  private handlePointerDown = (e: PointerEvent): void => {
    // S Pen barrel button: quick-action shortcut (grab the body under the nib)
    if (e.pointerType === 'pen' && (e.button === 1 || (e.buttons & 2) !== 0)) {
      const normQuick = this.normalize(e, 0, 0);
      this.callbacks.onPenQuickAction?.(normQuick);
      return;
    }

    // Double-tap / double-click detection
    const nowMs = e.timeStamp;
    if (this.lastTapPos && nowMs - this.lastTapTimeMs < 320) {
      const d = Math.hypot(e.clientX - this.lastTapPos.x, e.clientY - this.lastTapPos.y);
      if (d < 24) {
        this.lastTapTimeMs = 0;
        this.lastTapPos = null;
        this.callbacks.onDoubleTap?.(this.normalize(e, 0, 0));
        return;
      }
    }
    this.lastTapTimeMs = nowMs;
    this.lastTapPos = { x: e.clientX, y: e.clientY };

    this.prevPositions.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    const norm = this.normalize(e, 0, 0);
    this.activePointers.set(e.pointerId, norm);

    // If pen or primary pointer, initiate pointer capture
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (this.activePointers.size === 2) {
      // Multi-touch transition: abort any single-pointer drawing or manipulation so pinch/pan takes precedence
      if (this.isDrawingOrbit || this.isManipulatingObject) {
        this.isDrawingOrbit = false;
        this.isManipulatingObject = false;
        this.callbacks.onPointerCancel(norm);
      }

      // Start two-finger gesture
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      this.prevPinchDistance = dist;
      this.prevPinchCenter = {
        x: (pts[0].clientX + pts[1].clientX) / 2,
        y: (pts[0].clientY + pts[1].clientY) / 2,
      };
      return;
    }

    this.callbacks.onPointerDown(norm);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const prev = this.prevPositions.get(e.pointerId);
    const deltaX = prev ? e.clientX - prev.clientX : (e.movementX || 0);
    const deltaY = prev ? e.clientY - prev.clientY : (e.movementY || 0);
    this.prevPositions.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    const norm = this.normalize(e, deltaX, deltaY);
    this.activePointers.set(e.pointerId, norm);

    // Check for two-finger pinch zoom / pan
    if (this.activePointers.size === 2 && !this.isManipulatingObject && !this.isDrawingOrbit) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const center = {
        x: (pts[0].clientX + pts[1].clientX) / 2,
        y: (pts[0].clientY + pts[1].clientY) / 2,
      };

      if (this.prevPinchDistance && this.prevPinchDistance > 0) {
        const factor = this.prevPinchDistance / dist;
        this.callbacks.onPinchZoom(factor);
      }

      if (this.prevPinchCenter) {
        const dx = center.x - this.prevPinchCenter.x;
        const dy = center.y - this.prevPinchCenter.y;
        this.callbacks.onTwoFingerPan(dx, dy);
      }

      this.prevPinchDistance = dist;
      this.prevPinchCenter = center;
      return;
    }

    this.callbacks.onPointerMove(norm);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    const prev = this.prevPositions.get(e.pointerId);
    const deltaX = prev ? e.clientX - prev.clientX : (e.movementX || 0);
    const deltaY = prev ? e.clientY - prev.clientY : (e.movementY || 0);
    this.prevPositions.delete(e.pointerId);

    const norm = this.normalize(e, deltaX, deltaY);
    this.activePointers.delete(e.pointerId);

    try {
      this.element.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (this.activePointers.size < 2) {
      this.prevPinchDistance = null;
      this.prevPinchCenter = null;
    }

    this.callbacks.onPointerUp(norm);
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    this.prevPositions.delete(e.pointerId);
    const norm = this.normalize(e, 0, 0);
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size < 2) {
      this.prevPinchDistance = null;
      this.prevPinchCenter = null;
    }

    this.callbacks.onPointerCancel(norm);
  };
}
