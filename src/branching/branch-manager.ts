/**
 * Branch Manager & Causal Forking Orchestrator.
 * 
 * Invariants:
 * - Forking creates a branch child containing an independent snapshot and event ledger.
 * - Switching branches isolates consequences: a catastrophe in Branch B never corrupts Branch A.
 * - Re-evaluates differences when comparing two branches.
 */

import { SimulationEngine } from '../simulation/engine';
import { TimelineBranch, BranchComparisonResult } from './branch-types';

export class BranchManager {
  public branches: Map<string, TimelineBranch> = new Map();
  public activeBranchId: string;

  constructor(initialEngine: SimulationEngine, rootName: string = 'Prime Timeline') {
    const rootId = 'branch-prime';
    const rootBranch: TimelineBranch = {
      id: rootId,
      name: rootName,
      parentBranchId: null,
      forkTimeSec: initialEngine.timeSec,
      createdAtIso: new Date().toISOString(),
      snapshot: initialEngine.createSnapshot(),
      events: [...initialEngine.events],
    };

    this.branches.set(rootId, rootBranch);
    this.activeBranchId = rootId;
  }

  public getActiveBranch(): TimelineBranch {
    const b = this.branches.get(this.activeBranchId);
    if (!b) throw new Error(`Active branch ${this.activeBranchId} not found`);
    return b;
  }

  public getAllBranches(): TimelineBranch[] {
    return Array.from(this.branches.values());
  }

  /**
   * FORK FUTURE: Create a new causal branch from current simulation state.
   */
  public forkBranch(name: string, engine: SimulationEngine): TimelineBranch {
    // Save current active branch state first
    this.saveCurrentState(engine);

    const newId = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newBranch: TimelineBranch = {
      id: newId,
      name: name.trim() || `Fork @ ${Math.round(engine.timeSec)}s`,
      parentBranchId: this.activeBranchId,
      forkTimeSec: engine.timeSec,
      createdAtIso: new Date().toISOString(),
      snapshot: engine.createSnapshot(),
      events: [
        ...engine.events,
        {
          id: `fork-${Date.now()}`,
          timestampSec: engine.timeSec,
          type: 'branch_fork',
          title: `Branched Timeline: ${name}`,
          description: `Branched from ${this.getActiveBranch().name} at simulation time ${engine.timeSec.toFixed(1)}s.`,
          severity: 'info',
        },
      ],
    };

    this.branches.set(newId, newBranch);
    this.activeBranchId = newId;

    // Stamp the event into active engine
    engine.events = [...newBranch.events];

    return newBranch;
  }

  /**
   * Switch to a different branch, isolating and restoring its state in the engine.
   */
  public switchBranch(targetId: string, engine: SimulationEngine): boolean {
    const target = this.branches.get(targetId);
    if (!target || targetId === this.activeBranchId) return false;

    // Save active branch state
    this.saveCurrentState(engine);

    // Restore target branch state into engine
    this.activeBranchId = targetId;
    engine.restoreSnapshot(target.snapshot);
    engine.events = [...target.events];

    return true;
  }

  /**
   * Authoritatively checkpoint active branch from live engine state.
   */
  public checkpointActiveBranch(engine: SimulationEngine): void {
    const cur = this.branches.get(this.activeBranchId);
    if (cur) {
      cur.snapshot = engine.createSnapshot();
      cur.events = [...engine.events];
    }
  }

  private saveCurrentState(engine: SimulationEngine): void {
    this.checkpointActiveBranch(engine);
  }

  /**
   * Reconstitute a BranchManager from persisted branch data.
   */
  public static fromPersisted(branches: TimelineBranch[], activeBranchId: string): BranchManager {
    const mgr = Object.create(BranchManager.prototype) as BranchManager;
    mgr.branches = new Map();
    for (const b of branches) {
      mgr.branches.set(b.id, JSON.parse(JSON.stringify(b)));
    }
    mgr.activeBranchId = mgr.branches.has(activeBranchId) ? activeBranchId : (branches[0]?.id || 'branch-prime');
    return mgr;
  }

  /**
   * Compare causal consequences between two branches.
   */
  public compareBranches(branchAId: string, branchBId: string): BranchComparisonResult | null {
    const bA = this.branches.get(branchAId);
    const bB = this.branches.get(branchBId);
    if (!bA || !bB) return null;

    const idsA = new Set(bA.snapshot.bodies.map(b => b.id));
    const idsB = new Set(bB.snapshot.bodies.map(b => b.id));

    let survivingInBoth = 0;
    let lostInB = 0;
    let newInB = 0;

    for (const id of idsA) {
      if (idsB.has(id)) {
        survivingInBoth++;
      } else {
        lostInB++;
      }
    }

    for (const id of idsB) {
      if (!idsA.has(id)) {
        newInB++;
      }
    }

    const collisionsInB = bB.events.filter(e => e.type === 'collision').length;
    const starsilkInB = bB.events.filter(e => e.type === 'starsilk_pull' || e.type === 'heliocide_triggered').length;

    return {
      branchAName: bA.name,
      branchBName: bB.name,
      elapsedTimeDiffSec: bB.snapshot.timestampSec - bA.snapshot.timestampSec,
      branchABodiesCount: bA.snapshot.bodies.length,
      branchBBodiesCount: bB.snapshot.bodies.length,
      survivingInBothCount: survivingInBoth,
      bodiesLostInBCount: lostInB,
      bodiesNewInBCount: newInB,
      collisionsInBCount: collisionsInB,
      starsilkMacrosInBCount: starsilkInB,
    };
  }
}
