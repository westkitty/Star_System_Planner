import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FutureClient as FutureClientType } from '../simulation/future-client';
import { createDemonstrationSystem } from '../simulation/presets/demo-system';
import type { FutureForecastRequest, FutureForecastResponse } from '../workers/future.worker';

const baselineBody = createDemonstrationSystem().bodies[0];

async function loadForecastClient() {
  // The source module shares its protocol type with the worker entrypoint.
  // Provide only its global import surface; these tests never run a real worker.
  vi.stubGlobal('self', {});
  return (await import('../simulation/future-client')).FutureClient;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Forecast fidelity and truthful fallback', () => {
  it('labels the workerless straight-line fallback as approximate instead of a physics forecast', async () => {
    const FutureClient = await loadForecastClient();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('Worker', undefined);
    const response = await new Promise<FutureForecastResponse>((resolve) => {
      const client = new FutureClient((next) => {
        client.destroy();
        resolve(next);
      });
      client.requestForecast([baselineBody], { steps: 12, dtSeconds: 60 });
    });
    expect(response.approximate).toBe(true);
    expect(response.collisions).toEqual([]);
    expect(response.trajectories[baselineBody.id]).toHaveLength(13);
  });

  it('changes forecast cache identity for mass, physical radius and fixed-body edits', async () => {
    const FutureClient = await loadForecastClient();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('Worker', undefined);
    const client = new FutureClient();
    const calculateKey = (body: typeof baselineBody): string =>
      (client as unknown as { hashPayload: (p: FutureForecastRequest) => string }).hashPayload({
        requestId: 1,
        bodies: [body],
        steps: 120,
        dtSeconds: 30,
        selectedBodyId: body.id,
        calculateSensitivity: false,
      });
    const original = calculateKey(baselineBody);
    expect(calculateKey({ ...baselineBody, massKg: baselineBody.massKg * 1.01 })).not.toBe(original);
    expect(calculateKey({ ...baselineBody, radiusKm: baselineBody.radiusKm + 100 })).not.toBe(original);
    expect(calculateKey({ ...baselineBody, fixed: !baselineBody.fixed })).not.toBe(original);
    client.destroy();
  });

  it('never accepts a mismatched worker protocol as a valid trajectory or cache entry', async () => {
    const FutureClient = await loadForecastClient();
    class IncompatibleWorker {
      onmessage: ((event: MessageEvent<FutureForecastResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage(request: FutureForecastRequest) {
        queueMicrotask(() => this.onmessage?.({ data: {
          requestId: request.requestId,
          protocolVersion: 999,
          trajectories: { [baselineBody.id]: [] },
          collisions: [],
        } } as unknown as MessageEvent<FutureForecastResponse>));
      }
      terminate() { /* no external worker exists in this test */ }
    }
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', IncompatibleWorker);
    let client: FutureClientType | null = null;
    const response = await new Promise<FutureForecastResponse>((resolve) => {
      client = new FutureClient(resolve);
      client.requestForecast([baselineBody], { steps: 12, dtSeconds: 60 });
    });
    expect(response.approximate).toBe(true);
    expect(response.trajectories[baselineBody.id]).toHaveLength(13);
    expect(client!.getCacheStats().entries).toBe(0);
    expect(client!.getHealth().workerAlive).toBe(false);
    client!.destroy();
  });
});
