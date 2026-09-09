import { describe, it, expect } from 'vitest';
import { CANON_MANIFEST } from '../canon/manifest';
import { CANON_MACROS } from '../canon/macros';
import { SimulationEngine } from '../simulation/engine';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';
import { HoldToConfirmController } from '../interaction/hold-to-confirm';

describe('Starsilk Canon Invariants & Macro Fidelity', () => {
  it('enforces that Starsilk is literal programmable infrastructure and NOT sentient', () => {
    const nature = CANON_MANIFEST.entities.starsilkMaterial.canonicalNature;
    expect(nature).toContain('Starsilk itself is not sentient or sapient.');
    expect(nature).toContain('Death remains final. Starlight and Starsilk may retain data or residue without conscious afterlife.');
  });

  it('verifies HoldToConfirmController state machine: early release cancels without executing callback', () => {
    let executed = false;
    let progressRecorded = 0;

    const controller = new HoldToConfirmController({
      durationMs: 1800,
      onProgress: (p) => { progressRecorded = p; },
      onComplete: () => { executed = true; },
    });

    // Start hold
    controller.startHold(0);
    expect(controller.isHolding).toBe(true);

    // Advance 900ms (50% progress, before threshold)
    controller.advance(900);
    expect(progressRecorded).toBeCloseTo(0.5, 1);
    expect(executed).toBe(false);

    // User releases prematurely
    controller.cancelHold();
    expect(controller.isHolding).toBe(false);
    expect(controller.progress).toBe(0);
    expect(executed).toBe(false);

    // Further advancement does nothing
    controller.advance(2000);
    expect(executed).toBe(false);
  });

  it('verifies HoldToConfirmController completes and fires callback exactly once at threshold', () => {
    let executionCount = 0;

    const controller = new HoldToConfirmController({
      durationMs: 1800,
      onComplete: () => { executionCount++; },
    });

    controller.startHold(0);
    expect(controller.isHolding).toBe(true);

    // Advance to full threshold (1800ms)
    controller.advance(1800);
    expect(executionCount).toBe(1);
    expect(controller.isHolding).toBe(false);

    // Further advancement must not fire again
    controller.advance(2500);
    expect(executionCount).toBe(1);
  });

  it('verifies PULL STARSILK macro collapses star toward a black hole and sets system-destroyed status', () => {
    const star: CelestialBody = {
      id: 'star-target',
      name: 'Sun Alpha',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      luminosityW: 3.828e26,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#ffcc00',
    };

    const engine = new SimulationEngine([star]);
    expect(engine.systemStatus).toBe('active');

    const pullMacro = CANON_MACROS.find(m => m.id === 'pull-starsilk');
    expect(pullMacro).toBeDefined();
    expect(pullMacro?.plannerClassification).toBe('SOURCE-BACKED MECHANIC');
    expect(pullMacro?.sourceCanonStatus).toBe('unknown');

    const event = pullMacro?.apply(engine, 'star-target');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('starsilk_pull');
    expect(event?.severity).toBe('catastrophe');

    // System-level destroyed status must be permanently set
    expect(engine.systemStatus).toBe('destroyed_by_starsilk_collapse');

    // Star must now be collapsed toward black hole
    const modified = engine.bodies.find(b => b.id === 'star-target');
    expect(modified?.type).toBe('black_hole');
    expect(modified?.color).toBe('#000000');
    expect(modified?.luminosityW).toBe(0);
    expect(modified?.isCollapsedSingularity).toBe(true);
  });

  it('verifies Blood Ring structure uses vitrified crimson glass material, not ordinary ring geometry', () => {
    const planet: CelestialBody = {
      id: 'planet-drakken',
      name: 'Nacreous VI Analog',
      type: 'planet',
      massKg: 6e24,
      radiusKm: 6400,
      position: { x: 1e8, y: 0, z: 0 },
      velocity: { x: 0, y: 30, z: 0 },
      color: '#44aa88',
    };

    const engine = new SimulationEngine([planet]);
    const bloodRingMacro = CANON_MACROS.find(m => m.id === 'spawn-blood-ring');
    bloodRingMacro?.apply(engine, 'planet-drakken');

    const target = engine.bodies.find(b => b.id === 'planet-drakken');
    expect(target?.rings?.length).toBe(1);
    const ring = target?.rings?.[0];
    expect(ring?.isBloodRing).toBe(true);
    expect(ring?.color).toBe('#5a0008'); // Deep vitrified crimson glass
  });

  it('verifies Siege Wall study explicitly badges geometry as demonstrative sandbox and nodes as non-canonical', () => {
    const siegeMacro = CANON_MACROS.find(m => m.id === 'siege-wall-study');
    expect(siegeMacro).toBeDefined();
    expect(siegeMacro?.plannerClassification).toBe('CANON-INSPIRED SANDBOX');
    expect(siegeMacro?.demonstrativeNotice).toContain('DEMONSTRATIVE GEOMETRY — NODE COUNT AND SPACING ARE NOT CANON');

    const engine = new SimulationEngine([]);
    siegeMacro?.apply(engine);

    // Verify all generated nodes are clearly labeled non-canonical sandbox
    expect(engine.bodies.length).toBe(6);
    for (const node of engine.bodies) {
      expect(node.plannerClassification).toBe('CANON-INSPIRED SANDBOX');
      expect(node.sourceCanonStatus).toBe('unknown');
      expect(node.name).toContain('(Sandbox)');
    }
  });

  it('proves canon_status: unknown is never silently promoted to canon', () => {
    for (const macro of CANON_MACROS) {
      expect(macro.sourceCanonStatus).toBe('unknown');
      expect(macro.sourceCanonStatus).not.toBe('canon');
    }
  });
});
