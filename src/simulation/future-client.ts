/**
 * Future Forecast Worker Client.
 * 
 * Manages asynchronous communication with the future prediction Web Worker,
 * handles request token invalidation so stale calculations never overwrite newer states,
 * and provides a synchronous fallback for test / headless environments.
 */

import { CelestialBody } from './types';
import {
  FutureForecastRequest,
  FutureForecastResponse,
  PredictedPoint,
} from '../workers/future.worker';

export type ForecastCallback = (response: FutureForecastResponse) => void;

export class FutureClient {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private callback: ForecastCallback | null = null;

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

  /**
   * Request a new future prediction forecast.
   * Increments requestId to automatically invalidate any in-flight previous request.
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

    const steps = options?.steps ?? 240;
    const dtSeconds = options?.dtSeconds ?? 300;

    const payload: FutureForecastRequest = {
      requestId,
      bodies: JSON.parse(JSON.stringify(bodies)),
      steps,
      dtSeconds,
      selectedBodyId: options?.selectedBodyId ?? null,
      calculateSensitivity: options?.calculateSensitivity ?? false,
    };

    if (this.worker) {
      this.worker.postMessage(payload);
    } else {
      // Synchronous fallback (e.g. In Vitest)
      setTimeout(() => {
        if (this.currentRequestId === requestId && this.callback) {
          const dummyTraj: Record<string, PredictedPoint[]> = {};
          for (const b of bodies) {
            dummyTraj[b.id] = [{ positionKm: { ...b.position }, timestampSec: 0 }];
          }
          this.callback({
            requestId,
            trajectories: dummyTraj,
            collisions: [],
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
