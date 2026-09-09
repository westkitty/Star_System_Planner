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
}
