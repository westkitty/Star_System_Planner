/**
 * Architect scenario contracts (GAME13).
 *
 * Fixed long-form commissions beyond one-shot challenges: each contract
 * states a measurable end-state and reports live progress. Completions
 * persist and surface through the same celebratory channel as challenges.
 */

import { CelestialBody } from './types';
import { KM_PER_AU, SOLAR_MASS_KG } from './units';
import { assessHabitability } from './habitability';
import { detectResonances } from './syzygy';
import { findDominantPrimary } from './orbital-mechanics';
import { calculateOsculatingElements, computeLagrangePoints } from './orbital-mechanics';

export interface ContractProgress {
  done: boolean;
  progress: string;
}

export interface ContractContext {
  capturedBodyIds?: string[];
  /** craftId -> assisted planet ids, from the AssistTracker atlas. */
  assistAtlas?: Record<string, string[]>;
}

export interface ContractDefinition {
  id: string;
  title: string;
  brief: string;
  check: (bodies: CelestialBody[], ctx: ContractContext) => ContractProgress;
}

function isKDwarf(star: CelestialBody | null | undefined): boolean {
  if (!star || star.type !== 'star') return false;
  const m = star.massKg / SOLAR_MASS_KG;
  return m >= 0.45 && m < 0.8;
}

export const CONTRACT_DEFINITIONS: ContractDefinition[] = [
  {
    id: 'harbor-light',
    title: 'Harbor Light',
    brief: 'Hold a Promising-or-better world in orbit around a calm K dwarf.',
    check: (bodies) => {
      let best = 0;
      for (const b of bodies) {
        if (b.type !== 'planet' && b.type !== 'moon') continue;
        const primary = b.primaryId
          ? (bodies.find((x) => x.id === b.primaryId) ?? findDominantPrimary(b, bodies))
          : findDominantPrimary(b, bodies);
        if (!isKDwarf(primary)) continue;
        const report = assessHabitability(b, bodies);
        if (!report) continue;
        best = Math.max(best, report.score);
        if (report.score >= 60) {
          return { done: true, progress: `${b.name} shines at ${report.score}/100.` };
        }
      }
      return { done: false, progress: best > 0 ? `Best K-dwarf world: ${best}/100.` : 'No K-dwarf worlds yet.' };
    },
  },
  {
    id: 'resonance-architect',
    title: 'Resonance Architect',
    brief: 'Forge a 3:2 mean-motion resonance between two worlds sharing a star.',
    check: (bodies) => {
      const found = detectResonances(bodies).find((r) => r.ratioLabel === '3:2');
      if (found) {
        const a = bodies.find((b) => b.id === found.bodyAId)?.name ?? '?';
        const c = bodies.find((b) => b.id === found.bodyBId)?.name ?? '?';
        return { done: true, progress: `${a} ↔ ${c} locked 3:2.` };
      }
      const any = detectResonances(bodies);
      return {
        done: false,
        progress: any.length > 0 ? `${any.length} other resonance(s) humming.` : 'No resonances detected.',
      };
    },
  },
  {
    id: 'comet-shepherd',
    title: 'Comet Shepherd',
    brief: 'Capture a hyperbolic wanderer: bind an escape-trajectory body into orbit.',
    check: (bodies, ctx) => {
      const captured = ctx.capturedBodyIds ?? [];
      if (captured.length > 0) {
        const names = captured
          .map((id) => bodies.find((b) => b.id === id)?.name ?? id)
          .slice(0, 3)
          .join(', ');
        return { done: true, progress: `Bound: ${names}.` };
      }
      const wanderers = bodies.filter((b) => {
        if (b.type === 'star' || b.type === 'black_hole' || b.fixed) return false;
        const primary = findDominantPrimary(b, bodies);
        if (!primary) return false;
        const el = calculateOsculatingElements(b, primary);
        return !!el && !el.isBound;
      });
      return {
        done: false,
        progress: wanderers.length > 0 ? `${wanderers.length} unbound wanderer(s) available.` : 'No wanderers in flight.',
      };
    },
  },
  {
    id: 'trojan-shepherd',
    title: 'Trojan Shepherd',
    brief: 'Park a station or ship inside a star–planet L4/L5 trojan camp.',
    check: (bodies) => {
      const stars = bodies.filter((b) => b.type === 'star');
      const secondaries = bodies.filter((b) => b.type === 'planet' || b.type === 'moon');
      let best = Number.POSITIVE_INFINITY;
      for (const star of stars) {
        for (const secondary of secondaries) {
          if (secondary.id === star.id) continue;
          const points = computeLagrangePoints(star, secondary);
          if (!points) continue;
          for (const parked of bodies) {
            if (parked.id === star.id || parked.id === secondary.id) continue;
            if (parked.type !== 'station' && parked.type !== 'ship') continue;
            const camps: Array<{ label: string; at: { x: number; y: number; z: number } }> = [
              { label: 'L4', at: points.L4 },
              { label: 'L5', at: points.L5 },
            ];
            for (const camp of camps) {
              const d = Math.hypot(
                parked.position.x - camp.at.x,
                parked.position.y - camp.at.y,
                parked.position.z - camp.at.z
              );
              best = Math.min(best, d);
              if (d < 0.02 * KM_PER_AU) {
                return { done: true, progress: `${parked.name} holds the ${camp.label} camp of ${secondary.name}.` };
              }
            }
          }
        }
      }
      return {
        done: false,
        progress: Number.isFinite(best)
          ? `Nearest camp approach: ${(best / KM_PER_AU).toFixed(3)} AU.`
          : 'No stations or ships in flight.',
      };
    },
  },
  {
    id: 'heliocide-witness',
    title: 'Heliocide Witness',
    brief: 'Stand witness as a star collapses into a singularity.',
    check: (bodies) => {
      const fallen = bodies.filter((b) => b.isCollapsedSingularity);
      if (fallen.length > 0) {
        const names = fallen.map((f) => f.name).slice(0, 3).join(', ');
        return { done: true, progress: `${names} burn${fallen.length > 1 ? '' : 's'} no more.` };
      }
      const stars = bodies.filter((b) => b.type === 'star').length;
      return { done: false, progress: stars > 0 ? `${stars} star(s) still burning.` : 'No stars remain.' };
    },
  },
  {
    id: 'grand-tour',
    title: 'Grand Tour',
    brief: 'Fly one craft through gravity assists at three distinct worlds.',
    check: (bodies, ctx) => {
      const atlas = ctx.assistAtlas ?? {};
      let best = 0;
      let bestCraft = '';
      for (const [craftId, planetIds] of Object.entries(atlas)) {
        const distinct = new Set(planetIds).size;
        if (distinct > best) {
          best = distinct;
          bestCraft = bodies.find((b) => b.id === craftId)?.name ?? craftId;
        }
      }
      if (best >= 3) return { done: true, progress: `${bestCraft} toured ${best} distinct worlds.` };
      return {
        done: false,
        progress: best > 0 ? `${bestCraft}: ${best}/3 worlds toured.` : 'No multi-world tours yet.',
      };
    },
  },
];

const STORAGE_KEY = 'starsilk-contracts-v1';

function loadCompleted(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveCompleted(map: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private-mode: completions last the session */
  }
}

export class ContractTracker {
  private completed: Record<string, string> = loadCompleted();

  public isComplete(id: string): boolean {
    return Boolean(this.completed[id]);
  }

  public completedIds(): string[] {
    return Object.keys(this.completed);
  }

  /** Evaluate all contracts; returns newly completed definitions. */
  public evaluate(bodies: CelestialBody[], ctx: ContractContext = {}): ContractDefinition[] {
    const fresh: ContractDefinition[] = [];
    for (const def of CONTRACT_DEFINITIONS) {
      if (this.completed[def.id]) continue;
      const result = def.check(bodies, ctx);
      if (result.done) {
        this.completed[def.id] = new Date().toISOString();
        fresh.push(def);
      }
    }
    if (fresh.length > 0) saveCompleted(this.completed);
    return fresh;
  }

  public progressOf(def: ContractDefinition, bodies: CelestialBody[], ctx: ContractContext = {}): ContractProgress {
    if (this.completed[def.id]) return { done: true, progress: 'Commission fulfilled.' };
    return def.check(bodies, ctx);
  }

  public resetAll(): void {
    this.completed = {};
    saveCompleted(this.completed);
  }
}
