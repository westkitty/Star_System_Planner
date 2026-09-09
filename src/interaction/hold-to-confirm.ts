/**
 * Hold-To-Confirm State Controller.
 * 
 * Manages tactile press-and-hold gestures for high-consequence macros (e.g. PULL STARSILK).
 * Invariants:
 * - Premature release, leave, or cancel resets progress to 0 and invokes no callback.
 * - Only reaching 100% (progress >= 1.0) invokes onComplete, exactly once.
 * - Destruction / unmount safely clears all active timers and animation frames.
 */

export interface HoldToConfirmConfig {
  durationMs: number;
  onComplete: () => void;
  onProgress?: (progress: number) => void;
}

export class HoldToConfirmController {
  public isHolding: boolean = false;
  public progress: number = 0;
  private durationMs: number;
  private onComplete: () => void;
  private onProgress?: (progress: number) => void;
  private startTime: number = 0;
  private timerId: any = null;
  private completed: boolean = false;

  constructor(config: HoldToConfirmConfig) {
    this.durationMs = Math.max(10, config.durationMs || 1800);
    this.onComplete = config.onComplete;
    this.onProgress = config.onProgress;
  }

  public startHold(now?: number): void {
    this.cancelHold();
    this.isHolding = true;
    this.progress = 0;
    this.completed = false;
    this.startTime = now !== undefined ? now : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.onProgress?.(0);

    const step = () => {
      if (!this.isHolding) return;
      const current = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = current - this.startTime;
      this.progress = Math.min(1.0, Math.max(0.0, elapsed / this.durationMs));
      this.onProgress?.(this.progress);

      if (this.progress >= 1.0) {
        if (!this.completed) {
          this.completed = true;
          this.isHolding = false;
          this.onComplete();
        }
      } else {
        if (typeof requestAnimationFrame !== 'undefined') {
          this.timerId = requestAnimationFrame(step);
        } else {
          this.timerId = setTimeout(step, 16);
        }
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.timerId = requestAnimationFrame(step);
    } else {
      this.timerId = setTimeout(step, 16);
    }
  }

  public cancelHold(): void {
    if (this.timerId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.timerId);
      }
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.isHolding = false;
    this.progress = 0;
    this.onProgress?.(0);
  }

  /**
   * Deterministic step advancement for unit testing without relying on clock delays.
   */
  public advance(elapsedMs: number): void {
    if (!this.isHolding || this.completed) return;
    this.progress = Math.min(1.0, Math.max(0.0, elapsedMs / this.durationMs));
    this.onProgress?.(this.progress);

    if (this.progress >= 1.0) {
      this.completed = true;
      this.isHolding = false;
      this.cancelHold();
      this.onComplete();
    }
  }

  public destroy(): void {
    this.cancelHold();
  }
}
