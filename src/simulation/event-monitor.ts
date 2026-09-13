/**
 * Simulation consequence monitor (GAME05–07, GAME02–04, GAME06).
 *
 * Throttled watchdog pass over live bodies: escape trajectories, Roche /
 * Hill stability, thermal regime crossings, gravitational captures,
 * eclipses + transits, close-approach conjunctions, and mean-motion
 * resonances. Pair checks run through a spatial hash; Keplerian elements
 * come from the per-tick cache. Also aggregates the warning summary that
 * feeds the TopBar health pill.
 */

import { CelestialBody, ConsequenceEvent } from './types';
import { eventBus } from '../core/event-bus';
import { createId } from '../core/id';
import { PLANNER_CONFIG } from '../core/config';
import { calculateOsculatingElements, findDominantPrimary } from './orbital-mechanics';
import { getCachedElements } from './element-cache';
import { SpatialHash } from './spatial-hash';
import { detectConjunctions, detectResonances, detectSyzygies } from './syzygy';

export type ThermalRegime = 'frozen' | 'cold' | 'temperate' | 'hot' | 'inferno';

export function thermalRegimeFor(tempK: number | undefined): ThermalRegime {
  if (tempK === undefined) return 'cold';
  if (tempK < 200) return 'frozen';
  if (tempK < 273) return 'cold';
  if (tempK <= 320) return 'temperate';
  if (tempK < 900) return 'hot';
  return 'inferno';
}

interface TrackedState {
  wasBound: boolean;
  insideRoche: boolean;
  outsideHill: boolean;
  regime: ThermalRegime;
}

export interface MonitorWarningSummary {
  unbound: number;
  roche: number;
  thermalAlerts: number;
}

export class SimulationEventMonitor {
  private tracked = new Map<string, TrackedState>();
  private lastRunMs = 0;
  private hash = new SpatialHash(PLANNER_CONFIG.discovery.conjunctionKm);
  private conjunctionCooldown = new Map<string, number>();
  private syzygyCooldown = new Map<string, number>();
  private announcedResonances = new Set<string>();
  private summary: MonitorWarningSummary = { unbound: 0, roche: 0, thermalAlerts: 0 };
  /** Minimum wall-clock gap between monitor passes. */
  public throttleMs = 750;

  public reset(): void {
    this.tracked.clear();
    this.conjunctionCooldown.clear();
    this.syzygyCooldown.clear();
    this.announcedResonances.clear();
    this.summary = { unbound: 0, roche: 0, thermalAlerts: 0 };
    this.lastRunMs = 0;
  }

  /** Latest warning counts (updated on every executed pass). */
  public getWarningSummary(): MonitorWarningSummary {
    return { ...this.summary };
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
    for (const key of [...this.announcedResonances]) {
      const [a, c] = key.split('|');
      if (!liveIds.has(a) || !liveIds.has(c)) this.announcedResonances.delete(key);
    }

    let unbound = 0;
    let roche = 0;
    let thermalAlerts = 0;

    for (const body of bodies) {
      if (body.type === 'star' || body.type === 'black_hole' || body.fixed) continue;
      const primary = body.primaryId
        ? (bodies.find((b) => b.id === body.primaryId) ?? findDominantPrimary(body, bodies))
        : findDominantPrimary(body, bodies);
      if (!primary) continue;

      const elements = getCachedElements(body, primary, timeSec);
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

      if (!elements.isBound) unbound++;
      if (insideRoche) roche++;
      if (regime === 'inferno' || regime === 'frozen') thermalAlerts++;

      if (prev) {
        // Newly unbound orbit.
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
        // GAME06 — gravitational capture (unbound → bound).
        if (prev.wasBound === false && elements.isBound) {
          events.push({
            id: createId('capture'),
            timestampSec: timeSec,
            type: 'capture',
            title: `Gravitational Capture: ${body.name}`,
            description: `${primary.name} seized ${body.name} into a bound orbit (e=${elements.eccentricity.toFixed(3)}). A wanderer becomes a world.`,
            bodyIds: [body.id, primary.id],
            severity: 'info',
          });
          eventBus.emit('orbit:captured', { bodyId: body.id, primaryId: primary.id });
        }
        // Tidal / Hill stability.
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
        // Thermal regime crossing.
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

    this.summary = { unbound, roche, thermalAlerts };
    this.detectPairs(bodies, timeSec, events);
    return events;
  }

  /** Pairwise discovery: conjunctions, syzygies, resonances. */
  private detectPairs(bodies: CelestialBody[], timeSec: number, events: ConsequenceEvent[]): void {
    const byId = new Map(bodies.map((b) => [b.id, b]));

    // GAME03 — close approaches via spatial hash.
    const conjunctions = detectConjunctions(bodies, PLANNER_CONFIG.discovery.conjunctionKm, this.hash);
    for (const c of conjunctions) {
      const key = [c.bodyAId, c.bodyBId].sort().join('|');
      if ((this.conjunctionCooldown.get(key) ?? 0) > timeSec) continue;
      this.conjunctionCooldown.set(key, timeSec + PLANNER_CONFIG.discovery.conjunctionCooldownSec);
      const a = byId.get(c.bodyAId);
      const b = byId.get(c.bodyBId);
      events.push({
        id: createId('conjunction'),
        timestampSec: timeSec,
        type: 'conjunction',
        title: `Close Approach: ${a?.name ?? '?'} ↔ ${b?.name ?? '?'}`,
        description: `Separation ${(c.separationKm / 149597870.7).toFixed(4)} AU and closing — a collision forecast may follow.`,
        bodyIds: [c.bodyAId, c.bodyBId],
        severity: 'caution',
      });
      eventBus.emit('discovery:conjunction', { bodyAId: c.bodyAId, bodyBId: c.bodyBId });
    }

    // GAME02 — eclipses and transits.
    for (const s of detectSyzygies(bodies)) {
      const key = `${s.kind}|${s.viewerId}|${s.occluderId}|${s.starId}`;
      if ((this.syzygyCooldown.get(key) ?? 0) > timeSec) continue;
      this.syzygyCooldown.set(key, timeSec + PLANNER_CONFIG.discovery.syzygyCooldownSec);
      const viewer = byId.get(s.viewerId);
      const occluder = byId.get(s.occluderId);
      const star = byId.get(s.starId);
      const depth = Math.round(s.magnitude01 * 100);
      events.push({
        id: createId(s.kind),
        timestampSec: timeSec,
        type: s.kind,
        title:
          s.kind === 'eclipse'
            ? `Eclipse over ${viewer?.name ?? '?'}`
            : `Transit across ${star?.name ?? '?'} as seen from ${viewer?.name ?? '?'}`,
        description:
          s.kind === 'eclipse'
            ? `${occluder?.name ?? '?'} occults ${star?.name ?? '?'} above ${viewer?.name ?? '?'} (${depth}% depth).`
            : `${occluder?.name ?? '?'} crosses the disc of ${star?.name ?? '?'} (${depth}% chord).`,
        bodyIds: [s.viewerId, s.occluderId, s.starId],
        severity: 'info',
      });
      eventBus.emit(s.kind === 'eclipse' ? 'discovery:eclipse' : 'discovery:transit', {
        viewerId: s.viewerId,
        occluderId: s.occluderId,
        starId: s.starId,
        magnitude01: s.magnitude01,
      });
    }

    // GAME04 — mean-motion resonances (one-shot per pair).
    for (const r of detectResonances(bodies, PLANNER_CONFIG.discovery.resonanceTolerance)) {
      const key = [r.bodyAId, r.bodyBId].sort().join('|');
      if (this.announcedResonances.has(key)) continue;
      this.announcedResonances.add(key);
      const a = byId.get(r.bodyAId);
      const b = byId.get(r.bodyBId);
      events.push({
        id: createId('resonance'),
        timestampSec: timeSec,
        type: 'resonance',
        title: `Resonance Found: ${r.ratioLabel}`,
        description: `${a?.name ?? '?'} and ${b?.name ?? '?'} orbit in ${r.ratioLabel} mean-motion resonance (detune ${r.detunePct.toFixed(2)}%).`,
        bodyIds: [r.bodyAId, r.bodyBId, r.primaryId],
        severity: 'info',
      });
      eventBus.emit('discovery:resonance', {
        bodyAId: r.bodyAId,
        bodyBId: r.bodyBId,
        ratioLabel: r.ratioLabel,
      });
    }
  }
}

// Re-export for call sites that import the solver alongside the monitor.
export { calculateOsculatingElements };
