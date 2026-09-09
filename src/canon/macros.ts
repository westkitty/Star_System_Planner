/**
 * Starsilk Canon Macros and Cosmological Interventions.
 * 
 * Invariants:
 * - Operates as cosmological interventions layered ABOVE ordinary Newtonian physics.
 * - Pulling Starsilk from a star collapses it toward a black hole, marks systemStatus as destroyed,
 *   and stamps an irreversible catastrophe event.
 * - Canceling confirmation leaves simulation completely unmutated.
 * - Starbinding in planner is a local sandbox study of simultaneous extraction, not the galaxy-scale canon event.
 * - Siege Wall physical view is starless void absence, not a glowing neon fence; node count and spacing are sandbox geometry.
 * - Blood Rings use vitrified crimson scar material, not ordinary rings.
 */

import { CelestialBody, ConsequenceEvent, RingStructure, SourceCanonStatus, PlannerClassification } from '../simulation/types';
import { SimulationEngine } from '../simulation/engine';
import { getCompendiumUrl } from './manifest';

export interface CanonMacro {
  id: string;
  label: string;
  stableId: string;
  sourceUrl: string;
  sourceCanonStatus: SourceCanonStatus;
  plannerClassification: PlannerClassification;
  canonStatus?: string; // backwards compatibility alias for UI
  demonstrativeNotice?: string;
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
    sourceCanonStatus: 'unknown',
    plannerClassification: 'SOURCE-BACKED MECHANIC',
    canonStatus: 'SOURCE-BACKED MECHANIC',
    description: 'Engage stellar core and extract Starsilk. Immediate loss of stellar stability causes host star to collapse toward a black hole; system is destroyed.',
    holdDurationMs: 1800,
    requiresStar: true,
    apply: (engine: SimulationEngine, targetBodyId?: string): ConsequenceEvent | null => {
      if (!targetBodyId) return null;
      const star = engine.bodies.find(b => b.id === targetBodyId);
      if (!star || star.type !== 'star') return null;

      // 1. Photosphere collapses toward black hole
      star.type = 'black_hole';
      star.color = '#000000';
      star.luminosityW = 0;
      star.starsilkBleed = 1.0;
      star.isCollapsedSingularity = true;

      // Compact singularity scale
      star.radiusKm = Math.max(30.0, star.radiusKm * 0.0001);

      // 2. Irreversible system-level destroyed state
      engine.systemStatus = 'destroyed_by_starsilk_collapse';

      const event: ConsequenceEvent = {
        id: `macro-pull-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'starsilk_pull',
        title: `Starsilk Extraction: ${star.name} Collapsed`,
        description: `Stellar core engaged and Starsilk drawn. Immediate loss of stellar stability caused host star ${star.name} to collapse toward a black hole. Active system destroyed.`,
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
    sourceCanonStatus: 'unknown',
    plannerClassification: 'SOURCE-BACKED EVENT STUDY',
    canonStatus: 'SOURCE-BACKED EVENT STUDY',
    demonstrativeNotice: 'DEMONSTRATIVE STUDY — LOCAL SYSTEM ABSTRACTION, NOT GALAXY-SCALE CANON EVENT',
    description: 'Local sandbox abstraction of mass extraction across all system stars. Note: Local study only, not the galaxy-scale canonical Starbinding event.',
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

      // Mark system destroyed
      engine.systemStatus = 'destroyed_by_starsilk_collapse';

      const event: ConsequenceEvent = {
        id: `macro-starbinding-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'starsilk_pull',
        title: `Starbinding Study: ${stars.length} Stars Collapsed`,
        description: `Simultaneous stellar extraction collapsed ${collapsedNames.join(', ')} into black holes. Note: Local study only, not the galaxy-scale canon event. System destroyed.`,
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
    sourceCanonStatus: 'unknown',
    plannerClassification: 'SOURCE-BACKED STRUCTURE',
    canonStatus: 'SOURCE-BACKED STRUCTURE',
    description: 'Drakken vitrified biospheric atrocity-structure. Feedstock rendered via Gorevault and extruded toward orbit via Ringthroat.',
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
    label: 'SIEGE WALL — LOCAL SANDBOX STUDY',
    stableId: 'cosmic-architecture',
    sourceUrl: getCompendiumUrl('cosmic-architecture'),
    sourceCanonStatus: 'unknown',
    plannerClassification: 'CANON-INSPIRED SANDBOX',
    canonStatus: 'CANON-INSPIRED SANDBOX',
    demonstrativeNotice: 'DEMONSTRATIVE GEOMETRY — NODE COUNT AND SPACING ARE NOT CANON',
    description: 'Demonstrative sandbox study of black-hole containment lattice. DEMONSTRATIVE GEOMETRY — NODE COUNT AND SPACING ARE NOT CANON. Physical view is starless black void absence.',
    apply: (engine: SimulationEngine): ConsequenceEvent | null => {
      // Demonstrative sandbox geometry: 6 nodes at 6 AU
      const radiusKm = 6.0 * 149597870.7; // 6 AU containment perimeter
      const singularityCount = 6;

      for (let i = 0; i < singularityCount; i++) {
        const theta = (i / singularityCount) * Math.PI * 2;
        const bh: CelestialBody = {
          id: `siege-node-${i + 1}-${Date.now()}`,
          name: `Siege Node ${i + 1} (Sandbox)`,
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
          sourceCanonStatus: 'unknown',
          plannerClassification: 'CANON-INSPIRED SANDBOX',
          stableId: 'cosmic-architecture',
        };
        engine.bodies.push(bh);
      }

      const event: ConsequenceEvent = {
        id: `siege-${Date.now()}`,
        timestampSec: engine.timeSec,
        type: 'siege_wall_locked',
        title: 'Siege Wall Study Deployed (Demonstrative Sandbox)',
        description: 'Demonstrative sandbox study of black-hole containment perimeter. Node count and spacing are demonstrative sandbox geometry, not authored canon.',
        severity: 'caution',
      };

      engine.events.push(event);
      return event;
    },
  },
];
