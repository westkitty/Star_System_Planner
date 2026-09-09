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
}

export class PointerManager {
  private element: HTMLElement;
  private callbacks: PointerCallbacks;

  // Active pointers tracker
  private activePointers: Map<number, NormalizedPointerEvent> = new Map();

  // Multi-touch tracking
  private prevPinchDistance: number | null = null;
  private prevPinchCenter: { x: number; y: number } | null = null;

  // Suppression flags
  public isManipulatingObject: boolean = false;
  public isDrawingOrbit: boolean = false;

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
  }

  public destroy(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  private normalize(e: PointerEvent): NormalizedPointerEvent {
    return {
      pointerId: e.pointerId,
      pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
      clientX: e.clientX,
      clientY: e.clientY,
      pressure: e.pressure,
      isPrimary: e.isPrimary,
      rawEvent: e,
    };
  }

  private handlePointerDown = (e: PointerEvent): void => {
    const norm = this.normalize(e);
    this.activePointers.set(e.pointerId, norm);

    // If pen or primary pointer, initiate pointer capture
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (this.activePointers.size === 2) {
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
    const norm = this.normalize(e);
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
    const norm = this.normalize(e);
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
    const norm = this.normalize(e);
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size < 2) {
      this.prevPinchDistance = null;
      this.prevPinchCenter = null;
    }

    this.callbacks.onPointerCancel(norm);
  };
}
