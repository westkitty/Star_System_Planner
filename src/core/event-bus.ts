/**
 * Typed cross-system event bus (BACK01).
 *
 * Decouples simulation consequences (collisions, escapes, macro effects)
 * from presentation concerns (toasts, audio stingers, challenge progress).
 * Any module can publish domain events; UI subscribes without importing
 * engine internals.
 */

export type PlannerEventType =
  | 'body:created'
  | 'body:removed'
  | 'body:restored'
  | 'throw:released'
  | 'collision:occurred'
  | 'collision:forecast'
  | 'orbit:escape'
  | 'orbit:circularized'
  | 'orbit:fitted'
  | 'thermal:transition'
  | 'stability:warning'
  | 'branch:forked'
  | 'branch:switched'
  | 'macro:executed'
  | 'challenge:completed'
  | 'project:saved'
  | 'project:loaded'
  | 'project:imported'
  | 'project:exported'
  | 'quality:degraded'
  | 'quality:restored'
  | 'orbit:captured'
  | 'transfer:executed'
  | 'merge:executed'
  | 'discovery:eclipse'
  | 'discovery:transit'
  | 'discovery:conjunction'
  | 'discovery:resonance'
  | 'assist:measured'
  | 'contract:completed'
  | 'library:saved'
  | 'pwa:update-available'
  | 'recovery:completed'
  | 'ephemeris:exported';

export interface PlannerEvent<T = unknown> {
  type: PlannerEventType;
  atMs: number;
  payload: T;
}

/**
 * Typed event payloads (iteration 3, BACK02).
 *
 * Every domain event now declares the shape its publishers emit, so a
 * renamed field fails the build instead of silently starving subscribers.
 * Events not listed here keep the generic unknown payload.
 */
export interface PlannerEventPayloads {
  'body:created': { bodyId: string; name: string; type: string };
  'body:removed': { bodyId: string; name: string };
  'body:restored': { label: string };
  'throw:released': { bodyId: string };
  'collision:occurred': { eventId: string; bodyIds: string[]; timestampSec: number };
  'collision:forecast': { key: string; severity: string };
  'orbit:escape': { bodyId: string; primaryId: string };
  'orbit:circularized': { bodyId: string };
  'orbit:fitted': { bodyId: string; primaryId: string };
  'orbit:captured': { bodyId: string; primaryId: string };
  'thermal:transition': { bodyId: string; from: string; to: string };
  'stability:warning': { kind: string; bodyId: string; primaryId: string };
  'branch:forked': { branchId: string; name: string };
  'branch:switched': { branchId: string };
  'macro:executed': { macroId: string; targetId?: string };
  'challenge:completed': { id: string; title: string };
  'project:saved': { projectId?: string; kind: string; settings?: unknown };
  'project:loaded': { preset: string; name: string };
  'project:imported': { projectId: string; migrated: boolean };
  'project:exported': { projectId: string };
  'quality:degraded': { fps: number };
  'quality:restored': { fps: number };
  'transfer:executed': { bodyId: string; bodyName?: string; detail?: string };
  'merge:executed': { survivorId: string; survivorName: string; detail: string };
  'discovery:eclipse': { viewerId: string; occluderId: string; starId: string; magnitude01: number };
  'discovery:transit': { viewerId: string; occluderId: string; starId: string; magnitude01: number };
  'discovery:conjunction': { bodyAId: string; bodyBId: string };
  'discovery:resonance': { bodyAId: string; bodyBId: string; ratioLabel: string };
  'assist:measured': { craftId: string; planetId: string; craftName?: string; planetName?: string; deltaVKmS: number };
  'contract:completed': { contractId: string; title: string };
  'library:saved': { projectId: string; name: string };
  'pwa:update-available': Record<string, unknown>;
  'recovery:completed': { slotId: string };
  'ephemeris:exported': { bodyId: string };
}

export type PlannerEventHandler<T = unknown> = (event: PlannerEvent<T>) => void;

class EventBus {
  private handlers: Map<PlannerEventType, Set<PlannerEventHandler>> = new Map();
  private history: PlannerEvent[] = [];
  private readonly maxHistory = 128;

  public on<K extends keyof PlannerEventPayloads>(
    type: K,
    handler: PlannerEventHandler<PlannerEventPayloads[K]>
  ): () => void;
  public on<T>(type: PlannerEventType, handler: PlannerEventHandler<T>): () => void;
  public on(type: PlannerEventType, handler: PlannerEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as PlannerEventHandler);
    return () => this.off(type, handler as PlannerEventHandler);
  }

  public off(type: PlannerEventType, handler: PlannerEventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  public emit<K extends keyof PlannerEventPayloads>(type: K, payload: PlannerEventPayloads[K]): void;
  public emit<T>(type: PlannerEventType, payload: T): void;
  public emit(type: PlannerEventType, payload: unknown): void {
    const event: PlannerEvent = { type, atMs: Date.now(), payload };
    this.history.push(event as PlannerEvent);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as PlannerEventHandler)(event);
      } catch (err) {
        console.error(`[event-bus] handler for ${type} threw:`, err);
      }
    }
  }

  /** Recent events, newest last. Useful for diagnostics. */
  public recent(count = 20): PlannerEvent[] {
    return this.history.slice(-count);
  }

  public clear(): void {
    this.handlers.clear();
    this.history = [];
  }
}

export const eventBus = new EventBus();
