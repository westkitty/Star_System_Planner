/**
 * GPU resource disposal registry (BACK15).
 *
 * Long sessions create and destroy thousands of geometries, materials, and
 * textures (body churn, preset swaps, scrubbing). The registry tracks live
 * disposables by tag so shutdown paths actually release them and the
 * diagnostics export can report suspected leaks instead of vibes.
 */

export interface DisposableLike {
  dispose: () => void;
}

export interface DisposalReport {
  alive: number;
  byTag: Record<string, number>;
}

export class DisposalRegistry {
  private live = new Map<DisposableLike, string>();

  public track<T extends DisposableLike>(resource: T, tag: string): T {
    this.live.set(resource, tag);
    return resource;
  }

  /** Dispose and untrack. Safe to call with untracked resources. */
  public release(resource: DisposableLike | null | undefined): void {
    if (!resource) return;
    this.live.delete(resource);
    try {
      resource.dispose();
    } catch {
      /* already disposed — ignore */
    }
  }

  public aliveCount(): number {
    return this.live.size;
  }

  public report(): DisposalReport {
    const byTag: Record<string, number> = {};
    for (const tag of this.live.values()) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
    return { alive: this.live.size, byTag };
  }

  public resetForTests(): void {
    this.live.clear();
  }
}

export const disposalRegistry = new DisposalRegistry();
