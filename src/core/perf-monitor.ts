/**
 * Frame-rate performance monitor with automatic quality scaling (BACK07).
 *
 * Tracks rolling FPS / frame-time, exposes a HUD readout, and notifies the
 * renderer when sustained pressure warrants pixel-ratio reduction (or when
 * headroom allows restoring full quality).
 */

import { PLANNER_CONFIG } from './config';
import { eventBus } from './event-bus';

export interface PerfSample {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  degraded: boolean;
}

export interface PerfTelemetry {
  p50FrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  /** Frame-time histogram buckets: [<8ms, <16ms, <33ms, <50ms, ≥50ms]. */
  histogram: [number, number, number, number, number];
  longTasks: number;
}

export class PerfMonitor {
  private frameTimes: number[] = [];
  private lastNow = 0;
  private degraded = false;
  private cooldownUntil = 0;
  private listener: ((sample: PerfSample) => void) | null = null;
  private longTaskCount = 0;
  private longTaskObserved = false;

  /** Attach the long-task observer once (BACK10 jank attribution). */
  public observeLongTasks(): void {
    if (this.longTaskObserved) return;
    this.longTaskObserved = true;
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      const observer = new PerformanceObserver((list) => {
        this.longTaskCount += list.getEntries().length;
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      /* unsupported — longTasks stays 0 */
    }
  }

  /** Frame-time distribution + jank counters for diagnostics. */
  public getTelemetry(): PerfTelemetry {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const pick = (q: number): number =>
      sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const t of this.frameTimes) {
      if (t < 8) histogram[0]++;
      else if (t < 16) histogram[1]++;
      else if (t < 33) histogram[2]++;
      else if (t < 50) histogram[3]++;
      else histogram[4]++;
    }
    return {
      p50FrameMs: pick(0.5),
      p95FrameMs: pick(0.95),
      worstFrameMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      histogram,
      longTasks: this.longTaskCount,
    };
  }

  public onSample(listener: (sample: PerfSample) => void): void {
    this.listener = listener;
  }

  public beginFrame(now: number): void {
    if (this.lastNow > 0) {
      const dt = now - this.lastNow;
      if (dt > 0 && dt < 1000) {
        this.frameTimes.push(dt);
        if (this.frameTimes.length > 120) this.frameTimes.shift();
      }
    }
    this.lastNow = now;
  }

  public endFrame(): PerfSample | null {
    if (this.frameTimes.length < 30) return null;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const fps = 1000 / Math.max(avg, 0.01);
    const sample: PerfSample = { fps, avgFrameMs: avg, p95FrameMs: p95, degraded: this.degraded };
    this.listener?.(sample);
    this.evaluateScaling(sample);
    return sample;
  }

  private evaluateScaling(sample: PerfSample): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < this.cooldownUntil) return;
    const q = PLANNER_CONFIG.quality;
    if (!this.degraded && sample.fps < q.degradeFpsThreshold) {
      this.degraded = true;
      this.cooldownUntil = now + 8000;
      eventBus.emit('quality:degraded', { fps: sample.fps });
    } else if (this.degraded && sample.fps > q.recoverFpsThreshold) {
      this.degraded = false;
      this.cooldownUntil = now + 8000;
      eventBus.emit('quality:restored', { fps: sample.fps });
    }
  }

  public isDegraded(): boolean {
    return this.degraded;
  }

  public reset(): void {
    this.frameTimes = [];
    this.lastNow = 0;
    this.degraded = false;
    this.cooldownUntil = 0;
    this.longTaskCount = 0;
  }
}
