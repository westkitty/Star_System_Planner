/**
 * CSV ephemeris export (BACK12).
 *
 * Samples the N-body state forward with the real integrator and renders a
 * spreadsheet-friendly table (t, body, x/y/z). For analysis-minded
 * architects who want to plot, verify, or share trajectories outside the
 * planner. Bounded and synchronous — 720 samples of a 20-body system
 * integrate in milliseconds.
 */

import { CelestialBody } from './types';
import { stepVelocityVerlet } from './integrator';

export interface EphemerisSample {
  timeSec: number;
  bodies: Array<{ id: string; name: string; xKm: number; yKm: number; zKm: number }>;
}

export const EPHEMERIS_MAX_STEPS = 2000;

export function sampleEphemeris(
  bodies: CelestialBody[],
  steps: number,
  dtSeconds: number
): EphemerisSample[] {
  const clampedSteps = Math.max(1, Math.min(EPHEMERIS_MAX_STEPS, Math.floor(steps)));
  const dt = Math.max(1, dtSeconds);
  const sim: CelestialBody[] = JSON.parse(JSON.stringify(bodies));
  const out: EphemerisSample[] = [];
  for (let i = 0; i <= clampedSteps; i++) {
    out.push({
      timeSec: i * dt,
      bodies: sim.map((b) => ({
        id: b.id,
        name: b.name,
        xKm: b.position.x,
        yKm: b.position.y,
        zKm: b.position.z,
      })),
    });
    if (i < clampedSteps) {
      const ok = stepVelocityVerlet(sim, dt);
      if (!ok) break;
    }
  }
  return out;
}

export function ephemerisToCsv(samples: EphemerisSample[]): string {
  const lines = ['t_s,body_id,body_name,x_km,y_km,z_km'];
  for (const s of samples) {
    for (const b of s.bodies) {
      const safeName = b.name.includes(',') ? `"${b.name.replace(/"/g, '""')}"` : b.name;
      lines.push(`${s.timeSec},${b.id},${safeName},${b.xKm},${b.yKm},${b.zKm}`);
    }
  }
  return lines.join('\n');
}
