/**
 * Future Forecast Worker Client.
 *
 * Manages asynchronous communication with the future prediction Web Worker,
 * handles request token invalidation so stale calculations never overwrite newer states,
 * and provides a synchronous fallback for test / headless environments.
 *
 * BACK09 hardening: request coalescing window, dispatch timeout with
 * main-thread fallback, and strict stale-response guards.
 */

import { CelestialBody } from './types';
import {
  FutureForecastRequest,
  FutureForecastResponse,
  PredictedPoint,
} from '../workers/future.worker';
import { PLANNER_CONFIG } from '../core/config';
import { logger } from '../core/logger';

export type ForecastCallback = (response: FutureForecastResponse) => void;

export class FutureClient {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private callback: ForecastCallback | null = null;
  private lastDispatchMs = 0;
  private pendingPayload: FutureForecastRequest | null = null;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  // BACK04: state-hash-keyed forecast cache (LRU, small: responses are large).
  private forecastCache = new Map<string, FutureForecastResponse>();
  private lastRequestKey = '';
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly maxCacheEntries = 8;

  /** Cache telemetry for diagnostics. */
  public getCacheStats(): { hits: number; misses: number; entries: number } {
    return { hits: this.cacheHits, misses: this.cacheMisses, entries: this.forecastCache.size };
  }

  constructor(callback?: ForecastCallback) {
    if (callback) this.callback = callback;
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('../workers/future.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (e: MessageEvent<FutureForecastResponse>) => {
          const resp = e.data;
          // Discard stale responses from older requests
          if (resp.requestId === this.currentRequestId) {
            this.clearTimeout();
            this.storeInCache(resp);
            this.callback?.(resp);
          }
        };

        this.worker.onerror = (err) => {
          logger.warn('future-worker', 'Worker error; using threaded fallback next request', err);
        };
      } catch (e) {
        logger.warn('future-worker', 'Worker initialization fallback', e);
        this.worker = null;
      }
    }
  }

  public setCallback(callback: ForecastCallback): void {
    this.callback = callback;
  }

  /**
   * Request a new future prediction forecast.
   * BACK09: requests are coalesced inside a short window, guarded by a
   * timeout with synchronous fallback, and stale responses are discarded.
   */
  public requestForecast(
    bodies: CelestialBody[],
    options?: {
      steps?: number;
      dtSeconds?: number;
      selectedBodyId?: string | null;
      calculateSensitivity?: boolean;
    }
  ): number {
    this.currentRequestId++;
    const requestId = this.currentRequestId;

    const steps = options?.steps ?? PLANNER_CONFIG.forecast.steps;
    const dtSeconds = options?.dtSeconds ?? PLANNER_CONFIG.forecast.dtSeconds;

    const payload: FutureForecastRequest = {
      requestId,
      bodies: JSON.parse(JSON.stringify(bodies)),
      steps,
      dtSeconds,
      selectedBodyId: options?.selectedBodyId ?? null,
      calculateSensitivity: options?.calculateSensitivity ?? false,
    };

    // BACK04: serve identical states from cache without touching the worker.
    const cacheKey = this.hashPayload(payload);
    const cached = this.forecastCache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      const hit = { ...cached, requestId };
      setTimeout(() => {
        if (requestId === this.currentRequestId) this.callback?.(hit);
      }, 0);
      return requestId;
    }
    this.cacheMisses++;
    this.lastRequestKey = cacheKey;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - this.lastDispatchMs;
    if (elapsed >= PLANNER_CONFIG.forecast.minIntervalMs) {
      this.dispatch(payload);
    } else {
      // Coalesce: keep only the newest payload for the window edge.
      this.pendingPayload = payload;
      if (!this.coalesceTimer) {
        this.coalesceTimer = setTimeout(
          () => {
            this.coalesceTimer = null;
            if (this.pendingPayload) {
              const next = this.pendingPayload;
              this.pendingPayload = null;
              this.dispatch(next);
            }
          },
          PLANNER_CONFIG.forecast.minIntervalMs - elapsed
        );
      }
    }

    return requestId;
  }

  private dispatch(payload: FutureForecastRequest): void {
    this.lastDispatchMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.worker) {
      this.worker.postMessage(payload);
      this.armTimeout(payload);
    } else {
      this.syncFallback(payload);
    }
  }

  private armTimeout(payload: FutureForecastRequest): void {
    this.clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      // Worker is wedged: invalidate the in-flight request and fall back.
      if (payload.requestId === this.currentRequestId) {
        logger.warn('future-worker', 'Forecast timed out; using synchronous fallback');
        this.currentRequestId++;
        this.syncFallback({ ...payload, requestId: this.currentRequestId });
      }
    }, PLANNER_CONFIG.forecast.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /** Main-thread fallback: straight-line projection (never blocks). */
  private syncFallback(payload: FutureForecastRequest): void {
    setTimeout(() => {
      if (payload.requestId !== this.currentRequestId) return;
      const dummyTraj: Record<string, PredictedPoint[]> = {};
      for (const b of payload.bodies) {
        const points: PredictedPoint[] = [];
        for (let i = 0; i <= 12; i++) {
          points.push({
            positionKm: {
              x: b.position.x + b.velocity.x * payload.dtSeconds * i,
              y: b.position.y + b.velocity.y * payload.dtSeconds * i,
              z: b.position.z + b.velocity.z * payload.dtSeconds * i,
            },
            timestampSec: payload.dtSeconds * i,
          });
        }
        dummyTraj[b.id] = points;
      }
      this.callback?.({ requestId: payload.requestId, trajectories: dummyTraj, collisions: [] });
    }, 0);
  }

  /** Hash rounded state + request shape; insensitive to float jitter. */
  private hashPayload(payload: FutureForecastRequest): string {
    const parts: string[] = [
      String(payload.steps),
      String(payload.dtSeconds),
      payload.selectedBodyId ?? '-',
      payload.calculateSensitivity ? 's1' : 's0',
    ];
    for (const b of payload.bodies) {
      parts.push(
        [
          b.id,
          Math.round(b.position.x),
          Math.round(b.position.y),
          Math.round(b.position.z),
          Math.round(b.velocity.x * 1000),
          Math.round(b.velocity.y * 1000),
          Math.round(b.velocity.z * 1000),
        ].join(',')
      );
    }
    return parts.join('|');
  }

  private storeInCache(resp: FutureForecastResponse): void {
    // Responses are stored under the originating request's state hash so
    // identical future states hit without re-integrating.
    if (!this.lastRequestKey) return;
    if (this.forecastCache.size >= this.maxCacheEntries) {
      const oldest = this.forecastCache.keys().next().value as string | undefined;
      if (oldest) this.forecastCache.delete(oldest);
    }
    this.forecastCache.set(this.lastRequestKey, resp);
  }

  public destroy(): void {
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.clearTimeout();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
