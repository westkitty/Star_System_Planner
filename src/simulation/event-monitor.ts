/**
 * Live dynamical-event monitor (GAME05 escape watch, GAME06 tidal watch,
 * GAME07 thermal watch).
 *
 * Runs at a throttled cadence from the master loop and converts silent
 * physics transitions into ledger entries + bus events:
 * - newly unbound (escaping) orbits,
 * - Roche-limit breaches and Hill-sphere instability,
 * - equilibrium-temperature regime crossings (frozen / temperate / boiling).
 */

import { CelestialBody, ConsequenceEvent } from './types';
import { calculateOsculatingElements, findDominantPrimary } from './orbital-mechanics';
import { eventBus } from '../core/event-bus';

export type ThermalRegime = 'frozen' | 'cold' | 'temperate' | 'hot' | 'inferno';

export function thermalRegimeFor(tempK: number | undefined): ThermalRegime {
  const t = tempK ?? 273;
  if (t < 200) return 'frozen';
  if (t < 273) return 'cold';
  if (t <= 320) return 'temperate';
  if (t <= 500) return 'hot';
  return 'inferno';
}

interface TrackedState {
  wasBound: boolean | null;
  insideRoche: boolean;
  outsideHill: boolean;
  regime: ThermalRegime;
}

export class SimulationEventMonitor {
  private tracked = new Map<string, TrackedState>();
  private lastRunMs = 0;
  /** Minimum wall-clock gap between monitor passes. */
  public throttleMs = 750;

  public reset(): void {
    this.tracked.clear();
    this.lastRunMs = 0;
  }

  /**
   * Inspect bodies and return freshly-detected consequence events.
   * Pure with respect to the engine: the caller appends returned events.
   */
  public update(bodies: CelestialBody[], timeSec: number, nowMs?: number): ConsequenceEvent[] {
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - this.lastRunMs < this.throttleMs) return [];
    this.lastRunMs = now;

    const events: ConsequenceEvent[] = [];
    const liveIds = new Set(bodies.map((b) => b.id));
    for (const id of [...this.tracked.keys()]) {
      if (!liveIds.has(id)) this.tracked.delete(id);
    }

    for (const body of bodies) {
      if (body.type === 'star' || body.type === 'black_hole' || body.fixed) continue;
      const primary = body.primaryId
        ? bodies.find((b) => b.id === body.primaryId) ?? findDominantPrimary(body, bodies)
        : findDominantPrimary(body, bodies);
      if (!primary) continue;

      const elements = calculateOsculatingElements(body, primary);
      if (!elements) continue;

      const prev = this.tracked.get(body.id);
      const regime = thermalRegimeFor(body.temperatureK);
      const separationKm = Math.hypot(
        body.position.x - primary.position.x,
        body.position.y - primary.position.y,
        body.position.z - primary.position.z
      );
      const insideRoche = elements.rocheLimitKm !== null && separationKm < elements.rocheLimitKm;
      const outsideHill =
        elements.hillRadiusKm !== null && elements.hillRadiusKm > 0 && separationKm > elements.hillRadiusKm * 1.5;

      if (prev) {
        // GAME05 — newly unbound orbit.
        if (prev.wasBound === true && !elements.isBound) {
          events.push({
            id: `escape-${body.id}-${Math.round(timeSec)}`,
            timestampSec: timeSec,
            type: 'orbit_unbound',
            title: `Escape Trajectory: ${body.name}`,
            description: `${body.name} is no longer gravitationally bound to ${primary.name} (e=${elements.eccentricity.toFixed(3)}). It will leave the system unless captured.`,
            bodyIds: [body.id, primary.id],
            severity: 'caution',
          });
          eventBus.emit('orbit:escape', { bodyId: body.id, primaryId: primary.id });
        }
        // GAME06 — tidal / Hill stability.
        if (!prev.insideRoche && insideRoche) {
          events.push({
            id: `roche-${body.id}-${Math.round(timeSec)}`,
            timestampSec: timeSec,
            type: 'roche_violation',
            title: `Roche Breach: ${body.name}`,
            description: `${body.name} crossed inside the Roche limit of ${primary.name} — tidal disruption is imminent.`,
            bodyIds: [body.id, primary.id],
            severity: 'catastrophe',
          });
          eventBus.emit('stability:warning', { kind: 'roche', bodyId: body.id, primaryId: primary.id });
        }
        if (!prev.outsideHill && outsideHill) {
          events.push({
            id: `hill-${body.id}-${Math.round(timeSec)}`,
            timestampSec: timeSec,
            type: 'hill_instability',
            title: `Hill Instability: ${body.name}`,
            description: `${body.name} drifted beyond 1.5× the Hill radius of ${primary.name} — its orbit is no longer stable.`,
            bodyIds: [body.id, primary.id],
            severity: 'caution',
          });
          eventBus.emit('stability:warning', { kind: 'hill', bodyId: body.id, primaryId: primary.id });
        }
        // GAME07 — thermal regime crossing.
        if (prev.regime !== regime) {
          const severe =
            (prev.regime === 'temperate' || regime === 'inferno' || regime === 'frozen') &&
            prev.regime !== regime;
          events.push({
            id: `thermal-${body.id}-${Math.round(timeSec)}`,
            timestampSec: timeSec,
            type: 'temperature_shift',
            title: `Climate Shift: ${body.name}`,
            description: `${body.name} transitioned from ${prev.regime} to ${regime} (${(body.temperatureK ?? 0).toFixed(0)} K equilibrium).`,
            bodyIds: [body.id],
            severity: severe ? 'caution' : 'info',
          });
          eventBus.emit('thermal:transition', { bodyId: body.id, from: prev.regime, to: regime });
        }
      }

      this.tracked.set(body.id, { wasBound: elements.isBound, insideRoche, outsideHill, regime });
    }

    return events;
  }
}
