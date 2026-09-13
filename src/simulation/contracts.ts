/**
 * Architect scenario contracts (GAME13).
 *
 * Fixed long-form commissions beyond one-shot challenges: each contract
 * states a measurable end-state and reports live progress. Completions
 * persist and surface through the same celebratory channel as challenges.
 */

import { CelestialBody } from './types';
import { SOLAR_MASS_KG } from './units';
import { assessHabitability } from './habitability';
import { detectResonances } from './syzygy';
import { findDominantPrimary } from './orbital-mechanics';
import { calculateOsculatingElements } from './orbital-mechanics';

export interface ContractProgress {
  done: boolean;
  progress: string;
}

export interface ContractContext {
  capturedBodyIds?: string[];
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
