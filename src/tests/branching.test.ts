import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/engine';
import { BranchManager } from '../branching/branch-manager';
import { CelestialBody } from '../simulation/types';
import { exportProjectToJson, parseAndValidateProjectJson } from '../persistence/export-import';
import { SavedSystemProject } from '../persistence/db';

describe('Branching Engine & Causal Isolation', () => {
  it('preserves branch isolation: mutating bodies in a child branch does not mutate parent branch', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Sun',
      type: 'star',
      massKg: 1e30,
      radiusKm: 700000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      fixed: true,
      color: '#fff',
    };

    const planet: CelestialBody = {
      id: 'planet-1',
      name: 'Earth',
      type: 'planet',
      massKg: 6e24,
      radiusKm: 6400,
      position: { x: 1.5e8, y: 0, z: 0 },
      velocity: { x: 0, y: 30, z: 0 },
      color: '#2277ff',
    };

    const engine = new SimulationEngine([star, planet]);
    const branchManager = new BranchManager(engine, 'Root Prime');

    expect(branchManager.getAllBranches().length).toBe(1);

    // Fork branch: "Catastrophe Timeline"
    const catBranch = branchManager.forkBranch('Catastrophe Timeline', engine);
    expect(branchManager.activeBranchId).toBe(catBranch.id);

    // In Catastrophe Timeline, remove Earth and add a Rogue Singularity
    engine.removeBody('planet-1');
    const blackHole: CelestialBody = {
      id: 'bh-1',
      name: 'Rogue Singularity',
      type: 'black_hole',
      massKg: 1e31,
      radiusKm: 30,
      position: { x: 1e7, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#000',
    };
    engine.addBody(blackHole);

    expect(engine.bodies.length).toBe(2);
    expect(engine.bodies.find(b => b.id === 'planet-1')).toBeUndefined();
    expect(engine.bodies.find(b => b.id === 'bh-1')).toBeDefined();

    // Now switch BACK to Root Prime
    const switchedBack = branchManager.switchBranch('branch-prime', engine);
    expect(switchedBack).toBe(true);
    expect(branchManager.activeBranchId).toBe('branch-prime');

    // Verify Root Prime remains completely unmutated!
    expect(engine.bodies.length).toBe(2);
    expect(engine.bodies.find(b => b.id === 'planet-1')).toBeDefined();
    expect(engine.bodies.find(b => b.id === 'bh-1')).toBeUndefined();

    // Compare branches
    const comparison = branchManager.compareBranches('branch-prime', catBranch.id);
    expect(comparison).not.toBeNull();
    expect(comparison?.bodiesLostInBCount).toBe(1); // planet-1 lost in Catastrophe
    expect(comparison?.bodiesNewInBCount).toBe(1); // bh-1 created in Catastrophe
  });

  it('validates save and import round-trip', () => {
    const dummyProject: SavedSystemProject = {
      schemaVersion: '1.0.0',
      projectId: 'proj-test-123',
      projectName: 'Test Solar Realm',
      seed: 99999,
      branches: [
        {
          id: 'branch-prime',
          name: 'Prime Timeline',
          parentBranchId: null,
          forkTimeSec: 0,
          createdAtIso: new Date().toISOString(),
          snapshot: {
            timestampSec: 0,
            bodies: [
              {
                id: 'star-1',
                name: 'Alpha',
                type: 'star',
                massKg: 2e30,
                radiusKm: 696000,
                position: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 },
                color: '#ffcc00',
              },
            ],
          },
          events: [],
        },
      ],
      activeBranchId: 'branch-prime',
      events: [],
      simulationSettings: { enableCollisions: true, timeScale: 1.0 },
      visualSettings: { scaleMode: 'readable', showFuture: true, showSensitivity: false, showGravityGrid: false },
      cameraState: { target: { x: 0, y: 0, z: 0 }, distance: 250, viewMode: 'inertial' },
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
    };

    const json = exportProjectToJson(dummyProject);
    const restored = parseAndValidateProjectJson(json);

    expect(restored.projectId).toBe('proj-test-123');
    expect(restored.projectName).toBe('Test Solar Realm');
    expect(restored.branches[0].snapshot.bodies.length).toBe(1);
    expect(restored.branches[0].snapshot.bodies[0].name).toBe('Alpha');
  });
});
