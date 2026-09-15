import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../simulation/engine';
import { BranchManager } from '../branching/branch-manager';
import { CelestialBody } from '../simulation/types';
import { exportProjectToJson, parseAndValidateProjectJson } from '../persistence/export-import';
import { createSerializableProject } from '../persistence/serializer';

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

    // Verify Root Prime remains completely unmutated
    expect(engine.bodies.length).toBe(2);
    expect(engine.bodies.find(b => b.id === 'planet-1')).toBeDefined();
    expect(engine.bodies.find(b => b.id === 'bh-1')).toBeUndefined();

    // Compare branches
    const comparison = branchManager.compareBranches('branch-prime', catBranch.id);
    expect(comparison).not.toBeNull();
    expect(comparison?.bodiesLostInBCount).toBe(1); // planet-1 lost in Catastrophe
    expect(comparison?.bodiesNewInBCount).toBe(1); // bh-1 created in Catastrophe
  });

  it('guarantees autosave/export checkpoints live active branch without requiring a fork', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Kallisto',
      type: 'star',
      massKg: 2e30,
      radiusKm: 696000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#ffcc00',
    };

    const moon: CelestialBody = {
      id: 'moon-1',
      name: 'Thera',
      type: 'moon',
      massKg: 7e22,
      radiusKm: 1700,
      position: { x: 400000, y: 0, z: 0 },
      velocity: { x: 0, y: 1.0, z: 0 },
      color: '#cbd5e1',
    };

    const engine = new SimulationEngine([star, moon]);
    const branchManager = new BranchManager(engine, 'Live Active Prime');

    // Mutate moon's position and velocity directly without forking branches
    const targetMoon = engine.bodies.find(b => b.id === 'moon-1')!;
    targetMoon.position = { x: 999999, y: 1234, z: -5555 };
    targetMoon.velocity = { x: 42, y: -17, z: 8 };

    // Serialize using the authoritative serializer
    const serialized = createSerializableProject(
      'Authored Lab Experiment',
      branchManager,
      engine,
      { scaleMode: 'readable', showFuture: true, showSensitivity: false, showGravityGrid: false },
      { target: { x: 0, y: 0, z: 0 }, distance: 250, viewMode: 'inertial' },
      'test-autosave'
    );

    // Verify active branch in serialized project matches live mutated engine state
    const savedActiveBranch = serialized.branches.find(b => b.id === serialized.activeBranchId)!;
    const savedMoon = savedActiveBranch.snapshot.bodies.find(b => b.id === 'moon-1')!;

    expect(savedMoon.position.x).toBe(999999);
    expect(savedMoon.position.y).toBe(1234);
    expect(savedMoon.velocity.x).toBe(42);
    expect(serialized.projectName).toBe('Authored Lab Experiment');

    // Restore into a fresh engine and branch manager
    const restoredEngine = new SimulationEngine([]);
    restoredEngine.restoreSnapshot(savedActiveBranch.snapshot);

    const restoredMoon = restoredEngine.bodies.find(b => b.id === 'moon-1')!;
    expect(restoredMoon.position.x).toBe(999999);
    expect(restoredMoon.velocity.x).toBe(42);

    const rehydratedBranchMgr = BranchManager.fromPersisted(serialized.branches, serialized.activeBranchId);
    expect(rehydratedBranchMgr.activeBranchId).toBe(serialized.activeBranchId);
    expect(rehydratedBranchMgr.getAllBranches().length).toBe(1);
  });

  it('preserves systemStatus: destroyed_by_starsilk_collapse across serialization, export, and rehydration', () => {
    const star: CelestialBody = {
      id: 'star-1',
      name: 'Sun',
      type: 'star',
      massKg: 2e30,
      radiusKm: 696000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#fff',
    };

    const engine = new SimulationEngine([star]);
    const branchManager = new BranchManager(engine, 'Pre-Collapse');

    // Trigger catastrophe
    star.type = 'black_hole';
    engine.systemStatus = 'destroyed_by_starsilk_collapse';

    const serialized = createSerializableProject(
      'Destroyed System Archive',
      branchManager,
      engine,
      { scaleMode: 'readable', showFuture: true, showSensitivity: false, showGravityGrid: false },
      { target: { x: 0, y: 0, z: 0 }, distance: 250, viewMode: 'inertial' },
      'proj-destroyed'
    );

    expect(serialized.systemStatus).toBe('destroyed_by_starsilk_collapse');
    expect(serialized.branches[0].snapshot.systemStatus).toBe('destroyed_by_starsilk_collapse');

    // Round-trip export JSON
    const json = exportProjectToJson(serialized);
    const parsed = parseAndValidateProjectJson(json);

    expect(parsed.systemStatus).toBe('destroyed_by_starsilk_collapse');

    const freshEngine = new SimulationEngine([]);
    freshEngine.restoreSnapshot(parsed.branches[0].snapshot);
    expect(freshEngine.systemStatus).toBe('destroyed_by_starsilk_collapse');
  });
});

describe('Branch comparison — orbital shift matrix & energy truth', () => {
  const mkSystem = () => {
    const star: CelestialBody = {
      id: 'star-1', name: 'Sun', type: 'star', massKg: 1.989e30, radiusKm: 700000,
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, fixed: true, color: '#fff',
    };
    const planet: CelestialBody = {
      id: 'planet-1', name: 'Earth', type: 'planet', massKg: 6e24, radiusKm: 6400,
      position: { x: 1.5e8, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 29.8 }, color: '#2277ff',
    };
    return { star, planet };
  };

  it('identical snapshots yield a zero energy delta and zero-element matrix', () => {
    const { star, planet } = mkSystem();
    const engine = new SimulationEngine([star, planet], { enableCollisions: false });
    const mgrA = new BranchManager(engine, 'Prime');
    mgrA.forkBranch('Twin', engine);
    const cmp = mgrA.compareBranches('branch-prime', mgrA.activeBranchId);
    expect(cmp).toBeTruthy();
    expect(cmp!.energyDeltaJoules).toBe(0);
    for (const d of cmp!.bodyDeltas) {
      expect(d.deltaSemiMajorAxisKm).toBe(0);
      expect(d.deltaEccentricity).toBe(0);
      expect(d.deltaVelocityKmS).toBe(0);
    }
  });

  it('detects a velocity delta on a body present in both snapshots', () => {
    const { star, planet } = mkSystem();
    const engine = new SimulationEngine([star, planet], { enableCollisions: false });
    const mgr = new BranchManager(engine, 'Prime');
    const fork = mgr.forkBranch('Altered', engine);

    // Accelerate the planet in the forked branch, then checkpoint the active
    // branch (mirrors the app's live checkpoint behavior before comparisons)
    const body = engine.bodies.find(b => b.id === 'planet-1')!;
    body.velocity.z += 5;
    mgr.checkpointActiveBranch(engine);
    const cmp = mgr.compareBranches('branch-prime', fork.id)!;
    const delta = cmp.bodyDeltas.find(d => d.bodyId === 'planet-1');
    expect(delta).toBeTruthy();
    expect(delta!.deltaVelocityKmS).toBeCloseTo(5, 6);
    expect(delta!.deltaEccentricity).not.toBe(0);
    expect(cmp.energyDeltaJoules).toBeGreaterThan(0);
  });
});
