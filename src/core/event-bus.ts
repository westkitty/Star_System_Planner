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
  | 'quality:restored';

export interface PlannerEvent<T = unknown> {
  type: PlannerEventType;
  atMs: number;
  payload: T;
}

export type PlannerEventHandler<T = unknown> = (event: PlannerEvent<T>) => void;

class EventBus {
  private handlers: Map<PlannerEventType, Set<PlannerEventHandler>> = new Map();
  private history: PlannerEvent[] = [];
  private readonly maxHistory = 128;

  public on<T>(type: PlannerEventType, handler: PlannerEventHandler<T>): () => void {
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

  public emit<T>(type: PlannerEventType, payload: T): void {
    const event: PlannerEvent<T> = { type, atMs: Date.now(), payload };
    this.history.push(event as PlannerEvent);
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as PlannerEventHandler<T>)(event);
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
