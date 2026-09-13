/**
 * Authoritative Project Serialization Orchestrator.
 * 
 * Invariants:
 * - Guarantees the active branch snapshot is checkpointed from live engine state before serialization.
 * - Uniformly used by autosave, manual save, and project export to prevent stale-snapshot drift.
 * - Preserves systemStatus (including destroyed state) and authentic project metadata.
 */

import { BranchManager } from '../branching/branch-manager';
import { SimulationEngine } from '../simulation/engine';
import { SavedSystemProject } from './db';
import { CURRENT_SCHEMA_VERSION } from './migrations';

export interface VisualSettingsPayload {
  scaleMode: 'true' | 'readable';
  showFuture: boolean;
  showSensitivity: boolean;
  showGravityGrid: boolean;
}

export interface CameraStatePayload {
  target: { x: number; y: number; z: number };
  distance: number;
  viewMode: string;
}

export function createSerializableProject(
  projectName: string,
  branchManager: BranchManager,
  engine: SimulationEngine,
  visualSettings: VisualSettingsPayload,
  cameraState: CameraStatePayload,
  projectId: string = 'system-autosave',
  existingCreatedAtIso?: string
): SavedSystemProject {
  // Authoritative checkpoint: sync live engine state into active branch
  branchManager.checkpointActiveBranch(engine);

  const activeBranch = branchManager.getActiveBranch();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION as SavedSystemProject['schemaVersion'],
    projectId,
    projectName: projectName.trim() || 'Untitled System',
    seed: 42,
    branches: branchManager.getAllBranches(),
    activeBranchId: branchManager.activeBranchId,
    events: [...engine.events],
    systemStatus: engine.systemStatus,
    belts: engine.belts,
    hookshotRoutes: engine.hookshotRoutes,
    simulationSettings: {
      enableCollisions: engine.enableCollisions,
      timeScale: engine.timeScale,
    },
    visualSettings: { ...visualSettings },
    cameraState: { ...cameraState },
    createdAtIso: existingCreatedAtIso || activeBranch.createdAtIso || new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
  };
}
