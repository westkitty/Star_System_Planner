/**
 * Guided architect challenges — progression layer (GAME14).
 *
 * A curated set of sandbox objectives (stable moon, engineered ring,
 * slingshot escape, timeline fork, canon study...) tracked against live
 * planner events. Completions persist in localStorage and surface as
 * celebratory toasts, giving long sessions a sense of advancement without
 * constraining the sandbox.
 */

import { PlannerEventType, eventBus } from '../core/event-bus';
import { CelestialBody } from './types';
import { KM_PER_AU } from './units';
import { computeLagrangePoints } from './orbital-mechanics';

export type ChallengeTier = 'Initiate' | 'Architect' | 'Master';

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  hint: string;
  triggerEvents: PlannerEventType[];
  /** Progression tier (iteration 3, GAME06). */
  tier: ChallengeTier;
  /** Optional extra gate evaluated against live bodies. */
  gate?: (bodies: CelestialBody[]) => boolean;
}

export interface ChallengeState {
  id: string;
  completed: boolean;
  completedAtIso: string | null;
  progressHint: string;
}

export const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  {
    id: 'first-light',
    tier: 'Initiate',
    title: 'First Light',
    description: 'Select any celestial body to inspect its telemetry.',
    hint: 'Tap a planet or star in the viewport.',
    triggerEvents: [],
  },
  {
    id: 'worldwright',
    tier: 'Initiate',
    title: 'Worldwright',
    description: 'Create a new celestial body.',
    hint: 'Use CREATE in the tool rail to spawn a world.',
    triggerEvents: ['body:created'],
  },
  {
    id: 'loomweaver',
    tier: 'Initiate',
    title: 'Loomweaver',
    description: 'Fit a conic orbit with the Orbit Loom.',
    hint: 'Select the LOOM tool and draw a stroke with pen or mouse.',
    triggerEvents: ['orbit:fitted'],
  },
  {
    id: 'ringwright',
    tier: 'Architect',
    title: 'Ringwright',
    description: 'Engineer an orbital ring around any body.',
    hint: 'Commit a loom-fitted orbit as a ring, or invoke a blood ring.',
    triggerEvents: ['orbit:fitted', 'macro:executed'],
    gate: (bodies) => bodies.some((b) => (b.rings?.length ?? 0) > 0),
  },
  {
    id: 'slingshot',
    tier: 'Initiate',
    title: 'Slingshot Pilot',
    description: 'Throw a body with grab-and-throw.',
    hint: 'GRAB a moon, drag a velocity vector, release.',
    triggerEvents: ['throw:released'],
  },
  {
    id: 'escape-artist',
    tier: 'Architect',
    title: 'Escape Artist',
    description: 'Place any body on an unbound escape trajectory.',
    hint: 'Throw hard, or nudge prograde until e ≥ 1.',
    triggerEvents: ['orbit:escape'],
  },
  {
    id: 'cataclysm',
    tier: 'Architect',
    title: 'Cataclysm Witness',
    description: 'Observe a physical collision merger.',
    hint: 'Throw two worlds at each other with collisions enabled.',
    triggerEvents: ['collision:occurred'],
  },
  {
    id: 'soothsayer',
    tier: 'Architect',
    title: 'Soothsayer',
    description: 'Receive a forecast collision warning before impact.',
    hint: 'Keep SHOW FUTURE on while orbits destabilize.',
    triggerEvents: ['collision:forecast'],
  },
  {
    id: 'chronicler',
    tier: 'Initiate',
    title: 'Chronicler',
    description: 'Fork the timeline into a named causal branch.',
    hint: 'Use the fork control in the timeline bar.',
    triggerEvents: ['branch:forked'],
  },
  {
    id: 'navigator',
    tier: 'Architect',
    title: 'Navigator',
    description: 'Circularize any orbit with a single maneuver.',
    hint: 'Select a body and press CIRCULARIZE in the inspector.',
    triggerEvents: ['orbit:circularized'],
  },
  {
    id: 'canon-scholar',
    tier: 'Initiate',
    title: 'Canon Scholar',
    description: 'Execute any Starsilk canon mechanism.',
    hint: 'Open the Canon Lab and complete a hold-to-confirm macro.',
    triggerEvents: ['macro:executed'],
  },
  {
    id: 'steward',
    tier: 'Master',
    title: 'System Steward',
    description: 'Maintain 5+ bound bodies with no active warnings.',
    hint: 'Build calmly; watch the stability score.',
    triggerEvents: ['body:created', 'orbit:circularized', 'orbit:fitted'],
    gate: (bodies) => bodies.length >= 6,
  },
  // ---- Iteration 2 commissions (GAME05) ----
  {
    id: 'eclipse-chaser',
    tier: 'Architect',
    title: 'Eclipse Chaser',
    description: 'Witness an eclipse or transit between your worlds.',
    hint: 'Align a moon between its planet and the star, then let time run.',
    triggerEvents: ['discovery:eclipse', 'discovery:transit'],
  },
  {
    id: 'lagrange-parker',
    tier: 'Master',
    title: 'Lagrange Parker',
    description: 'Park any body near the L4 or L5 point of a star–planet pair.',
    hint: 'Throw a station 60° ahead of (or behind) a planet on its orbit.',
    triggerEvents: ['body:created', 'throw:released', 'orbit:circularized'],
    gate: (bodies) => {
      const stars = bodies.filter((b) => b.type === 'star');
      const secondaries = bodies.filter((b) => b.type === 'planet' || b.type === 'moon');
      for (const star of stars) {
        for (const secondary of secondaries) {
          if (secondary.id === star.id) continue;
          const points = computeLagrangePoints(star, secondary);
          if (!points) continue;
          for (const parked of bodies) {
            if (parked.id === star.id || parked.id === secondary.id) continue;
            if (parked.type === 'star' || parked.type === 'black_hole') continue;
            for (const anchor of [points.L4, points.L5]) {
              const d = Math.hypot(
                parked.position.x - anchor.x,
                parked.position.y - anchor.y,
                parked.position.z - anchor.z
              );
              if (d < 0.02 * KM_PER_AU) return true;
            }
          }
        }
      }
      return false;
    },
  },
  {
    id: 'hohmann-pilot',
    tier: 'Architect',
    title: 'Hohmann Pilot',
    description: 'Execute a planned transfer departure burn.',
    hint: 'Open Transfers in the inspector, plan a Hohmann leg, and burn.',
    triggerEvents: ['transfer:executed'],
  },
  {
    id: 'comet-wrangler',
    tier: 'Master',
    title: 'Comet Wrangler',
    description: 'Capture an unbound wanderer into a bound orbit.',
    hint: 'Slow a hyperbolic body near periapsis until the system seizes it.',
    triggerEvents: ['orbit:captured'],
  },
  {
    id: 'eclipse-photo',
    tier: 'Master',
    title: 'Eclipse Photographer',
    description: 'Capture a PRESENT-mode frame while an eclipse is underway.',
    hint: 'Enter PRESENT during an eclipse warning and press P to capture.',
    triggerEvents: [],
  },
];

/** Progression order for tiered mission display. */
export const TIER_ORDER: ChallengeTier[] = ['Initiate', 'Architect', 'Master'];

const STORAGE_KEY = 'starsilk-planner-challenges-v1';

function loadPersisted(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function persist(map: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* persistence is best-effort */
  }
}

export class ChallengeTracker {
  private states = new Map<string, ChallengeState>();
  private listeners = new Set<(states: ChallengeState[]) => void>();
  private bodyProvider: () => CelestialBody[] = () => [];
  private unsubscribers: Array<() => void> = [];

  constructor() {
    const persisted = loadPersisted();
    for (const def of CHALLENGE_DEFINITIONS) {
      const completedAtIso = persisted[def.id] ?? null;
      this.states.set(def.id, {
        id: def.id,
        completed: completedAtIso !== null,
        completedAtIso,
        progressHint: def.hint,
      });
    }
    const watched = new Set<PlannerEventType>();
    for (const def of CHALLENGE_DEFINITIONS) {
      for (const t of def.triggerEvents) watched.add(t);
    }
    for (const type of watched) {
      this.unsubscribers.push(eventBus.on(type, () => this.evaluate(type)));
    }
  }

  public setBodyProvider(provider: () => CelestialBody[]): void {
    this.bodyProvider = provider;
  }

  public subscribe(listener: (states: ChallengeState[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  public list(): ChallengeState[] {
    return CHALLENGE_DEFINITIONS.map((d) => this.states.get(d.id)!).filter(Boolean);
  }

  public definitions(): ChallengeDefinition[] {
    return CHALLENGE_DEFINITIONS;
  }

  public completedCount(): number {
    return this.list().filter((s) => s.completed).length;
  }

  /** Manually credit an event-less challenge (e.g. first selection). */
  public credit(challengeId: string): void {
    this.complete(challengeId);
  }

  public resetAll(): void {
    for (const def of CHALLENGE_DEFINITIONS) {
      this.states.set(def.id, { id: def.id, completed: false, completedAtIso: null, progressHint: def.hint });
    }
    persist({});
    this.notify();
  }

  private evaluate(trigger: PlannerEventType): void {
    const bodies = this.bodyProvider();
    for (const def of CHALLENGE_DEFINITIONS) {
      if (!def.triggerEvents.includes(trigger)) continue;
      const state = this.states.get(def.id);
      if (!state || state.completed) continue;
      if (def.gate && !def.gate(bodies)) continue;
      this.complete(def.id);
    }
  }

  private complete(id: string): void {
    const state = this.states.get(id);
    if (!state || state.completed) return;
    state.completed = true;
    state.completedAtIso = new Date().toISOString();
    const persisted = loadPersisted();
    persisted[id] = state.completedAtIso;
    persist(persisted);
    const def = CHALLENGE_DEFINITIONS.find((d) => d.id === id);
    eventBus.emit('challenge:completed', { id, title: def?.title ?? id });
    this.notify();
  }

  private notify(): void {
    const states = this.list();
    for (const listener of this.listeners) {
      try {
        listener(states);
      } catch {
        /* listener errors must never break tracking */
      }
    }
  }

  public destroy(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.listeners.clear();
  }
}
