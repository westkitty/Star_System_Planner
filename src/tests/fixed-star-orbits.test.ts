import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CelestialBody } from '../simulation/types';
import { computeAccelerations, stepVelocityVerlet } from '../simulation/integrator';
import { G_KM, KM_PER_AU, SOLAR_MASS_KG, EARTH_MASS_KG } from '../simulation/units';
import type { FutureForecastRequest, FutureForecastResponse } from '../workers/future.worker';

const ONE_HOUR = 3600;
const QUARTER_YEAR_HOURS = 89 * 24;
const orbitalSpeed = Math.sqrt(G_KM * SOLAR_MASS_KG / KM_PER_AU);

function bodiesInOrder(): CelestialBody[] {
  return [
    {
      id: 'fixed-star', name: 'Gravity anchor', type: 'star', fixed: true,
      massKg: SOLAR_MASS_KG, radiusKm: 696340,
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      color: '#ffd785',
    },
    {
      id: 'orbiter', name: 'Witness', type: 'planet',
      massKg: EARTH_MASS_KG, radiusKm: 6371,
      position: { x: KM_PER_AU, y: 0, z: 0 },
      velocity: { x: 0, y: orbitalSpeed, z: 0 },
      color: '#399cff',
    },
  ];
}

function expectQuarterOrbit(position: CelestialBody['position']): void {
  const radius = Math.hypot(position.x, position.y, position.z);
  expect(radius / KM_PER_AU).toBeGreaterThan(0.98);
  expect(radius / KM_PER_AU).toBeLessThan(1.02);
  expect(position.y / KM_PER_AU).toBeGreaterThan(0.93);
  expect(Math.abs(position.x / KM_PER_AU)).toBeLessThan(0.20);
}

afterEach(() => vi.unstubAllGlobals());

describe('Fixed stellar anchors retain gravitational influence', () => {
  it('accelerates an orbiter toward a fixed star independent of body order', () => {
    const [star, planet] = bodiesInOrder();
    const starFirst = computeAccelerations([star, planet])[1];
    const starLast = computeAccelerations([planet, star])[0];
    const expectedAcceleration = -G_KM * SOLAR_MASS_KG / (KM_PER_AU ** 2);
    expect(starFirst.ax).toBeCloseTo(expectedAcceleration, 9);
    expect(starLast.ax).toBeCloseTo(expectedAcceleration, 9);
    expect(starFirst.ax).toBeCloseTo(starLast.ax, 12);
    expect(starFirst.ay).toBe(0);
    expect(computeAccelerations([star, planet])[0].ax).toBe(0);
  });

  it('keeps a fixed-star orbit curved and stable over an actual quarter-year', () => {
    const bodies = bodiesInOrder();
    for (let hour = 0; hour < QUARTER_YEAR_HOURS; hour++) {
      expect(stepVelocityVerlet(bodies, ONE_HOUR)).toBe(true);
    }
    expectQuarterOrbit(bodies[1].position);
    expect(bodies[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('uses the same anchored gravity rule in the real prediction worker', async () => {
    let response: FutureForecastResponse | null = null;
    const host: {
      onmessage?: (event: MessageEvent<FutureForecastRequest>) => void;
      postMessage: (value: FutureForecastResponse) => void;
    } = {
      postMessage(value) { response = value; },
    };
    vi.stubGlobal('self', host);
    await import('../workers/future.worker');
    expect(host.onmessage).toBeTypeOf('function');
    host.onmessage!({ data: {
      requestId: 7,
      bodies: bodiesInOrder(),
      steps: QUARTER_YEAR_HOURS,
      dtSeconds: ONE_HOUR,
      selectedBodyId: 'orbiter',
      calculateSensitivity: false,
    } } as MessageEvent<FutureForecastRequest>);
    const forecast = response as FutureForecastResponse | null;
    expect(forecast).not.toBeNull();
    expect(forecast!.protocolVersion).toBe(1);
    expect(forecast!.approximate).not.toBe(true);
    const points = forecast!.trajectories.orbiter;
    expect(points.length).toBeGreaterThan(100);
    expectQuarterOrbit(points.at(-1)!.positionKm);
  });
});
