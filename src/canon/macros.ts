/**
 * Starsilk Canon Macros and Cosmological Interventions.
 * 
 * Invariants:
 * - Operates as cosmological interventions layered ABOVE ordinary Newtonian physics.
 * - Pulling Starsilk from a star collapses it into a black hole and stamps a catastrophe event.
 * - Canceling confirmation leaves simulation completely unmutated.
 * - Siege Wall physical view is starless void absence, not a glowing neon fence.
 * - Blood Rings use vitrified crimson scar material (#4A0006), not ordinary rings.
 */

import { CelestialBody, ConsequenceEvent, RingStructure } from '../simulation/types';
import { SimulationEngine } from '../simulation/engine';
import { getCompendiumUrl } from './manifest';

export interface CanonMacro {
  id: string;
  label: string;
  stableId: string;
  sourceUrl: string;
  canonStatus: string;
  description: string;
  holdDurationMs?: number;
  requiresStar?: boolean;
  requiresMultipleStars?: boolean;
  requiresPlanet?: boolean;
  apply: (engine: SimulationEngine, targetBodyId?: string) => ConsequenceEvent | null;
}

export const CANON_MACROS: CanonMacro[] = [
  {
    id: 'pull-starsilk',
    label: 'PULL STARSILK',
    stableId: 'starsilk-material',
    sourceUrl: getCompendiumUrl('starsilk-material'),
    canonStatus: 'CANON MECHANIC',
    description: 'Engage stellar target, draw programmable Starsilk filaments, and withdraw. Causes catastrophic stellar destabilization and collapse toward a black hole.',
    holdDurationMs: 1800,
    requiresStar: true,
    apply: (engine: SimulationEngine, targetBodyId?: string): ConsequenceEvent | null => {
      if (!targetBodyId) return null;
      const star = engine.bodies.find(b => b.id === targetBodyId);
      if (!star || star.type !== 'star') return null;

      // Execute canonical star dive catastrophe:
      // 1. Photosphere collapses into black hole
      star.type = 'black_hole';
      star.color = '#000000';
      star.luminosityW = 0;
      star.starsilkBleed = 1.0;
      star.isCollapsedSingularity = true;

      // Schwarzschild radius approx: r_s = 2 * G * M / c^2 ~ 3 km per solar mass
      // For visual presence, set radius to compact singularity scale
      star.radiusKm = Math.max(30.0, star.radiusKm * 0.0001);

      const event: ConsequenceEvent = {
        id: `macro-pull-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'starsilk_pull',
        title: `Starsilk Extraction: ${star.name} Collapsed`,
        description: `Cosmological macro extracted Starsilk from ${star.name}. The core lost structural equilibrium and collapsed into an event-horizon singularity.`,
        bodyIds: [star.id],
        severity: 'catastrophe',
      };

      engine.events.push(event);
      return event;
    },
  },
  {
    id: 'starbinding-study',
    label: 'STARBINDING — LOCAL STUDY',
    stableId: 'starsilk-material',
    sourceUrl: getCompendiumUrl('starsilk-material'),
    canonStatus: 'CANON EVENT STUDY',
    description: 'Local demonstration of the Starbinding mechanism: simultaneous mass extraction across all stars in the active system.',
    holdDurationMs: 2500,
    requiresMultipleStars: true,
    apply: (engine: SimulationEngine): ConsequenceEvent | null => {
      const stars = engine.bodies.filter(b => b.type === 'star');
      if (stars.length === 0) return null;

      const collapsedNames: string[] = [];
      for (const s of stars) {
        s.type = 'black_hole';
        s.color = '#000000';
        s.luminosityW = 0;
        s.starsilkBleed = 1.0;
        s.isCollapsedSingularity = true;
        s.radiusKm = Math.max(30.0, s.radiusKm * 0.0001);
        collapsedNames.push(s.name);
      }

      const event: ConsequenceEvent = {
        id: `macro-starbinding-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'starsilk_pull',
        title: `Starbinding Study: ${stars.length} Stars Collapsed`,
        description: `Simultaneous stellar extraction collapsed ${collapsedNames.join(', ')} into black holes. Note: Local study only, not the galaxy-scale canon event.`,
        bodyIds: stars.map(s => s.id),
        severity: 'catastrophe',
      };

      engine.events.push(event);
      return event;
    },
  },
  {
    id: 'spawn-blood-ring',
    label: 'CONSTRUCT BLOOD RING',
    stableId: 'systems',
    sourceUrl: getCompendiumUrl('systems'),
    canonStatus: 'CANON STRUCTURE',
    description: 'Drakken vitrified biospheric atrocity-structure. Material reads as deep vitrified crimson glass, severe and orbital.',
    requiresPlanet: true,
    apply: (engine: SimulationEngine, targetBodyId?: string): ConsequenceEvent | null => {
      if (!targetBodyId) return null;
      const body = engine.bodies.find(b => b.id === targetBodyId);
      if (!body) return null;

      if (!body.rings) body.rings = [];

      const bloodRing: RingStructure = {
        id: `blood-ring-${Date.now()}`,
        name: `Blood Ring [${body.name}]`,
        innerRadiusKm: body.radiusKm * 1.6,
        outerRadiusKm: body.radiusKm * 2.8,
        isBloodRing: true,
        normal: { x: 0, y: 1, z: 0 },
        color: '#5a0008',
        opacity: 0.95,
      };

      body.rings.push(bloodRing);

      const event: ConsequenceEvent = {
        id: `ring-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'body_created',
        title: `Blood Ring Constructed around ${body.name}`,
        description: `Vitrified crimson atrocity-structure extruded into orbit. Feedstock rendered via Gorevault and Ringthroat logic.`,
        bodyIds: [body.id],
        severity: 'caution',
      };

      engine.events.push(event);
      return event;
    },
  },
  {
    id: 'siege-wall-study',
    label: 'SIEGE WALL CONTAINMENT STUDY',
    stableId: 'cosmic-architecture',
    sourceUrl: getCompendiumUrl('cosmic-architecture'),
    canonStatus: 'CANON EVENT STUDY',
    description: 'Black-hole lattice containment boundary. In physical view it appears as starless black void absence; in tactical mode as containment geometry.',
    apply: (engine: SimulationEngine): ConsequenceEvent | null => {
      // Creates a circle of 6 micro-singularities around outer boundary
      const radiusKm = 6.0 * 149597870.7; // 6 AU containment perimeter
      const singularityCount = 6;

      for (let i = 0; i < singularityCount; i++) {
        const theta = (i / singularityCount) * Math.PI * 2;
        const bh: CelestialBody = {
          id: `siege-node-${i + 1}-${Date.now()}`,
          name: `Siege Node ${i + 1}`,
          type: 'black_hole',
          massKg: 1e29,
          radiusKm: 100,
          position: {
            x: radiusKm * Math.cos(theta),
            y: 0,
            z: radiusKm * Math.sin(theta),
          },
          velocity: {
            x: -Math.sin(theta) * 12.0,
            y: 0,
            z: Math.cos(theta) * 12.0,
          },
          color: '#000000',
          isCollapsedSingularity: true,
          canonClassification: 'CANON STRUCTURE',
          stableId: 'cosmic-architecture',
        };
        engine.bodies.push(bh);
      }

      const event: ConsequenceEvent = {
        id: `siege-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'siege_wall_locked',
        title: 'Siege Wall Containment Lattice Deployed',
        description: 'Black-hole containment perimeter established at 6.0 AU. Reads as starless void absence from physical perspective.',
        severity: 'caution',
      };

      engine.events.push(event);
      return event;
    },
  },
];
