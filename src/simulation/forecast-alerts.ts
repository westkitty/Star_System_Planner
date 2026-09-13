/**
 * Forecast-collision alert synthesizer (GAME04).
 *
 * Converts raw worker collision predictions into deduplicated, severity-
 * ranked HUD alerts: the planner now warns the architect BEFORE bodies
 * collide instead of only recording the aftermath.
 */

import { FutureForecastResponse, PredictedCollision } from '../workers/future.worker';
import { CelestialBody } from './types';

export interface ForecastAlert {
  key: string;
  bodyAId: string;
  bodyBId: string;
  bodyAName: string;
  bodyBName: string;
  timeToImpactSec: number;
  timestampSec: number;
  severity: 'watch' | 'warning' | 'imminent';
}

export function severityForTimeToImpact(seconds: number): ForecastAlert['severity'] {
  if (seconds < 86400) return 'imminent'; // < 1 day
  if (seconds < 86400 * 30) return 'warning'; // < 30 days
  return 'watch';
}

function alertKey(c: PredictedCollision): string {
  return [c.bodyAId, c.bodyBId].sort().join('::');
}

export class ForecastAlertTracker {
  private active = new Map<string, ForecastAlert>();
  private announcedLedgerKeys = new Set<string>();

  /** Merge a fresh worker response; returns currently active alerts. */
  public ingest(response: FutureForecastResponse, bodies: CelestialBody[]): ForecastAlert[] {
    const seen = new Set<string>();
    const byId = new Map(bodies.map((b) => [b.id, b]));
    for (const c of response.collisions ?? []) {
      const key = alertKey(c);
      seen.add(key);
      const a = byId.get(c.bodyAId);
      const b = byId.get(c.bodyBId);
      this.active.set(key, {
        key,
        bodyAId: c.bodyAId,
        bodyBId: c.bodyBId,
        bodyAName: a?.name ?? c.bodyAId,
        bodyBName: b?.name ?? c.bodyBId,
        timeToImpactSec: c.timeToImpactSec,
        timestampSec: c.timestampSec,
        severity: severityForTimeToImpact(c.timeToImpactSec),
      });
    }
    // Expire alerts the fresh forecast no longer predicts.
    for (const key of [...this.active.keys()]) {
      if (!seen.has(key)) {
        this.active.delete(key);
        this.announcedLedgerKeys.delete(key);
      }
    }
    return this.list();
  }

  public list(): ForecastAlert[] {
    const rank = { imminent: 0, warning: 1, watch: 2 };
    return [...this.active.values()].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || a.timeToImpactSec - b.timeToImpactSec
    );
  }

  /** Alerts not yet written to the ledger (for one-time announcement). */
  public unannounced(): ForecastAlert[] {
    return this.list().filter((a) => !this.announcedLedgerKeys.has(a.key));
  }

  public markAnnounced(key: string): void {
    this.announcedLedgerKeys.add(key);
  }

  public clear(): void {
    this.active.clear();
    this.announcedLedgerKeys.clear();
  }
}
