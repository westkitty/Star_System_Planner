/**
 * Gravity-assist meter (GAME07).
 *
 * Watches close planetary flybys and measures the inertial Δv a small body
 * gains (or loses) between entering and leaving the encounter sphere. Real
 * slingshots get celebrated in the ledger; the best assist of the session
 * is tracked for the mission debrief.
 */

import { CelestialBody, ConsequenceEvent } from './types';
import { KM_PER_AU } from './units';
import { createId } from '../core/id';
import { PLANNER_CONFIG } from '../core/config';

export interface AssistEvent extends ConsequenceEvent {
  type: 'assist';
  deltaVKmS: number;
  craftId: string;
  planetId: string;
}

interface PassState {
  entrySpeedKmS: number;
  entryTimeSec: number;
  minSeparationKm: number;
}

const COOLDOWN_SEC = 86400;

export class AssistTracker {
  private passes = new Map<string, PassState>();
  private cooldownUntil = new Map<string, number>();
  private bestDeltaVKmS = 0;
  private bestLabel = '';
  /** craftId -> assisted planet ids (iteration 3, GAME01 grand tour). */
  private flybys = new Map<string, Set<string>>();
  /** Most recent measured assists, newest first (iteration 3, GAME02). */
  private recent: AssistEvent[] = [];
  private readonly maxRecent = 8;

  public get best(): { deltaVKmS: number; label: string } {
    return { deltaVKmS: this.bestDeltaVKmS, label: this.bestLabel };
  }

  public reset(): void {
    this.passes.clear();
    this.cooldownUntil.clear();
    this.bestDeltaVKmS = 0;
    this.bestLabel = '';
    this.flybys.clear();
    this.recent = [];
  }

  /** Recent measured assists, newest first, for the mission debrief. */
  public recentAssists(): AssistEvent[] {
    return [...this.recent];
  }

  /** craftId -> assisted planet ids, for the grand-tour contract. */
  public grandTourAtlas(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [craftId, planetIds] of this.flybys) out[craftId] = [...planetIds];
    return out;
  }

  private passRadiusKm(planet: CelestialBody): number {
    return Math.max(planet.radiusKm * 25, 0.01 * KM_PER_AU);
  }

  private speedOf(b: CelestialBody): number {
    return Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
  }

  public update(bodies: CelestialBody[], timeSec: number): AssistEvent[] {
    const out: AssistEvent[] = [];
    const crafts = bodies.filter((b) => !b.fixed && b.type !== 'star' && b.type !== 'black_hole');
    const planets = bodies.filter(
      (b) => b.type === 'planet' || b.type === 'moon' || b.type === 'dwarf_planet'
    );
    const liveKeys = new Set<string>();
    for (const craft of crafts) {
      for (const planet of planets) {
        if (craft.id === planet.id) continue;
        const key = `${craft.id}|${planet.id}`;
        liveKeys.add(key);
        const sep = Math.hypot(
          craft.position.x - planet.position.x,
          craft.position.y - planet.position.y,
          craft.position.z - planet.position.z
        );
        const radius = this.passRadiusKm(planet);
        const active = this.passes.get(key);
        if (!active && sep <= radius) {
          this.passes.set(key, {
            entrySpeedKmS: this.speedOf(craft),
            entryTimeSec: timeSec,
            minSeparationKm: sep,
          });
        } else if (active) {
          active.minSeparationKm = Math.min(active.minSeparationKm, sep);
          if (sep > radius * 1.5) {
            this.passes.delete(key);
            const cooling = this.cooldownUntil.get(key) ?? 0;
            const dv = this.speedOf(craft) - active.entrySpeedKmS;
            if (timeSec >= cooling && dv >= PLANNER_CONFIG.discovery.assistMinDvKmS) {
              this.cooldownUntil.set(key, timeSec + COOLDOWN_SEC);
              if (dv > this.bestDeltaVKmS) {
                this.bestDeltaVKmS = dv;
                this.bestLabel = `${craft.name} @ ${planet.name}`;
              }
              const measured: AssistEvent = {
                id: createId('assist'),
                timestampSec: timeSec,
                type: 'assist',
                title: `Gravity assist: ${craft.name} +${dv.toFixed(2)} km/s`,
                description:
                  `${craft.name} stole orbital energy from ${planet.name} during a ` +
                  `${(active.minSeparationKm / planet.radiusKm).toFixed(1)}-radii flyby.`,
                bodyIds: [craft.id, planet.id],
                severity: 'info',
                deltaVKmS: dv,
                craftId: craft.id,
                planetId: planet.id,
              };
              out.push(measured);
              this.recent.unshift(measured);
              this.recent = this.recent.slice(0, this.maxRecent);
              if (!this.flybys.has(measured.craftId)) this.flybys.set(measured.craftId, new Set());
              this.flybys.get(measured.craftId)!.add(measured.planetId);
            }
          }
        }
      }
    }
    for (const key of [...this.passes.keys()]) {
      if (!liveKeys.has(key)) this.passes.delete(key);
    }
    return out;
  }
}
