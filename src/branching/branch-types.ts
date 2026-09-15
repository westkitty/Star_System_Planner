/**
 * Causal Branching Types and Diff Models.
 */

import { ConsequenceEvent, SimulationSnapshot } from '../simulation/types';

export interface TimelineBranch {
  id: string;
  name: string;
  parentBranchId: string | null;
  forkTimeSec: number;
  createdAtIso: string;
  snapshot: SimulationSnapshot;
  events: ConsequenceEvent[];
}

/** Osculating-element shift for one body surviving across both snapshots. */
export interface BranchBodyDelta {
  bodyId: string;
  name: string;
  deltaSemiMajorAxisKm: number;
  deltaEccentricity: number;
  deltaVelocityKmS: number;
}

export interface BranchComparisonResult {
  branchAName: string;
  branchBName: string;
  elapsedTimeDiffSec: number;
  branchABodiesCount: number;
  branchBBodiesCount: number;
  survivingInBothCount: number;
  bodiesLostInBCount: number;
  bodiesNewInBCount: number;
  collisionsInBCount: number;
  starsilkMacrosInBCount: number;
  /** Orbital shift matrix for bodies present in both snapshots. */
  bodyDeltas: BranchBodyDelta[];
  /** Total mechanical energy delta (B minus A), joules. */
  energyDeltaJoules: number;
}
