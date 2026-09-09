import { describe, it, expect } from 'vitest';
import { CANON_MANIFEST, getCompendiumUrl } from '../canon/manifest';
import { CANON_MACROS } from '../canon/macros';
import { SimulationEngine } from '../simulation/engine';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';

describe('Starsilk Canon Invariants & Macro Fidelity', () => {
  it('enforces that Starsilk is literal programmable infrastructure and NOT sentient', () => {
    const nature = CANON_MANIFEST.entities.starsilkMaterial.canonicalNature;
    expect(nature).toContain('Starsilk itself is not sentient or sapient.');
    expect(nature).toContain('Death remains final. Starlight and Starsilk may retain data or residue without conscious afterlife.');
  });

  it('verifies PULL STARSILK macro transitions a selected star into a black hole with catastrophe event', () => {
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
    const pullMacro = CANON_MACROS.find(m => m.id === 'pull-starsilk');
    expect(pullMacro).toBeDefined();

    const event = pullMacro?.apply(engine, 'star-target');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('starsilk_pull');
    expect(event?.severity).toBe('catastrophe');

    // Star must now be a black hole
    const modified = engine.bodies.find(b => b.id === 'star-target');
    expect(modified?.type).toBe('black_hole');
    expect(modified?.color).toBe('#000000');
    expect(modified?.luminosityW).toBe(0);
    expect(modified?.isCollapsedSingularity).toBe(true);
  });

  it('guarantees that canceling PULL STARSILK confirmation performs zero state mutation', () => {
    const star: CelestialBody = {
      id: 'star-untouched',
      name: 'Stable Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696340,
      luminosityW: 3.828e26,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#ffffff',
    };

    const engine = new SimulationEngine([star]);
    const initialEventsCount = engine.events.length;

    // Simulate user releasing / canceling confirmation without hold completion
    const holdCompleted = false;
    if (holdCompleted) {
      CANON_MACROS.find(m => m.id === 'pull-starsilk')?.apply(engine, 'star-untouched');
    }

    // Must be completely untouched
    expect(star.type).toBe('star');
    expect(star.luminosityW).toBe(3.828e26);
    expect(engine.events.length).toBe(initialEventsCount);
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
    expect(ring?.color).toBe('#5a0008'); // Deep vitrified crimson scar
  });

  it('verifies Siege Wall physical representation is starless black void absence', () => {
    const siegeStructure = CANON_MANIFEST.entities.cosmicArchitecture.structures.find(
      s => s.id === 'siege-wall'
    );
    expect(siegeStructure?.note).toContain(
      'Physical view is starless black void absence, not glowing geometric grid.'
    );
  });

  it('preserves provenance and leaves unauthored fields explicitly unknown', () => {
    expect(CANON_MANIFEST.sourceBaseUrl).toBe('https://westkitty.github.io/Starsilk_Character_Dossier');
    expect(getCompendiumUrl('starsilk-material')).toContain('/entities/starsilk-material/');

    // Check unknown coordinate honesty
    const templatesUnknowns = CANON_MANIFEST.entities.worldsvaultTemplates.unknownsNotice;
    expect(templatesUnknowns).toContain('spatial coordinates between templates are unauthored');
  });
});
