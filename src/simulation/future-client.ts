/**
 * Future Forecast Worker Client.
 *
 * Manages asynchronous communication with the future prediction Web Worker,
 * handles request token invalidation so stale calculations never overwrite newer
 * states, throttles dispatch so drag-speed interaction cannot flood the worker,
 * skips byte-identical repeat payloads, and provides a synchronous fallback for
 * test / headless environments.
 */

import { CelestialBody, Vector3D } from './types';
import { FORECAST_MIN_INTERVAL_MS } from './tuning';
import { computeSensitivityFans, summarizeFanOutcomes } from './sensitivity';
import {
  FutureForecastRequest,
  FutureForecastResponse,
  PredictedPoint,
} from '../workers/future.worker';

export type ForecastCallback = (response: FutureForecastResponse) => void;

export interface ForecastOptions {
  steps?: number;
  dtSeconds?: number;
  selectedBodyId?: string | null;
  calculateSensitivity?: boolean;
  perturbFraction?: number;
}

/**
 * Cheap quantization hash so identical state snippets never re-dispatch a forecast.
 */
function hashForecastPayload(bodies: CelestialBody[], options: ForecastOptions): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  };
  mix(bodies.length);
  for (const b of bodies) {
    mix(Math.round(b.position.x / 1000));
    mix(Math.round(b.position.y / 1000));
    mix(Math.round(b.position.z / 1000));
    mix(Math.round(b.velocity.x * 10));
    mix(Math.round(b.velocity.y * 10));
    mix(Math.round(b.velocity.z * 10));
    mix(b.id.length);
  }
  mix(options.steps ?? 240);
  mix(options.dtSeconds ?? 300);
  mix(options.calculateSensitivity ? 1 : 0);
  mix(Math.round((options.perturbFraction ?? 0) * 1e6));
  return (h >>> 0).toString(36);
}

export class FutureClient {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private callback: ForecastCallback | null = null;
  private lastDispatchMs = 0;
  private lastHash: string | null = null;
  private workerFailed = false;

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
          if (resp.requestId === this.currentRequestId && this.callback) {
            this.callback(resp);
          }
        };

        this.worker.onerror = (err) => {
          console.warn('[Future Worker] Error:', err);
          // Permanently fall back to synchronous computation so forecasts keep working
          this.workerFailed = true;
          try {
            this.worker?.terminate();
          } catch {
            /* ignore */
          }
          this.worker = null;
        };
      } catch (e) {
        console.warn('[Future Worker] Worker initialization fallback:', e);
        this.worker = null;
      }
    }
  }

  public setCallback(callback: ForecastCallback): void {
    this.callback = callback;
  }

  /** True when forecasts still compute (real worker or synchronous fallback). */
  public get isOperational(): boolean {
    return this.worker !== null || typeof window === 'undefined' || this.workerFailed;
  }

  /**
   * Synchronously compute the sensitivity fan on the main thread (fallback or
   * headless environments only).
   */
  private computeSyncSensitivity(
    request: Omit<FutureForecastRequest, 'requestId'>
  ): { fans: Vector3D[][]; stats: ReturnType<typeof summarizeFanOutcomes> } | undefined {
    const selIndex = request.selectedBodyId
      ? request.bodies.findIndex(b => b.id === request.selectedBodyId)
      : -1;
    if (!request.calculateSensitivity || selIndex === -1) return undefined;
    const res = computeSensitivityFans({
      bodies: request.bodies,
      selectedIndex: selIndex,
      dtSeconds: request.dtSeconds,
      testSteps: Math.min(180, request.steps),
      fanCount: 30,
      perturbFraction: request.perturbFraction ?? 0.015,
    });
    return { fans: res.fans, stats: summarizeFanOutcomes(res.outcomes) };
  }

  /**
   * Request a new future prediction forecast.
   * Increments requestId to automatically invalidate any in-flight previous request.
   */
  public requestForecast(bodies: CelestialBody[], options?: ForecastOptions, force: boolean = false): number {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const payloadHash = hashForecastPayload(bodies, options ?? {});
    const intervalOk = nowMs - this.lastDispatchMs >= FORECAST_MIN_INTERVAL_MS;
    if (!force && (!intervalOk || this.lastHash === payloadHash)) {
      return this.currentRequestId;
    }
    this.lastDispatchMs = nowMs;
    this.lastHash = payloadHash;

    this.currentRequestId++;
    const requestId = this.currentRequestId;

    const steps = options?.steps ?? 240;
    const dtSeconds = options?.dtSeconds ?? 300;

    const payload: FutureForecastRequest = {
      requestId,
      bodies: JSON.parse(JSON.stringify(bodies)),
      steps,
      dtSeconds,
      selectedBodyId: options?.selectedBodyId ?? null,
      calculateSensitivity: options?.calculateSensitivity ?? false,
      perturbFraction: options?.perturbFraction ?? 0.015,
    };

    if (this.worker) {
      this.worker.postMessage(payload);
    } else {
      // Synchronous fallback (e.g. in Vitest or after a worker failure)
      setTimeout(() => {
        if (this.currentRequestId === requestId && this.callback) {
          const dummyTraj: Record<string, PredictedPoint[]> = {};
          for (const b of bodies) {
            dummyTraj[b.id] = [{ positionKm: { ...b.position }, timestampSec: 0 }];
          }
          const sync = this.computeSyncSensitivity(payload);
          this.callback({
            requestId,
            trajectories: dummyTraj,
            collisions: [],
            sensitivityFans: sync?.fans,
            sensitivityStats: sync?.stats,
          });
        }
      }, 0);
    }

    return requestId;
  }

  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
