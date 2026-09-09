/**
 * Source-Backed Reference Scenario: Virgil & Meridian Station.
 * 
 * Sources:
 * - /entities/cosmic-architecture/#stations-fortresses-outposts
 * - /worldsvault/#edge-orbits--meridian-station--virgil
 * 
 * Classification: CANON EVENT STUDY / REFERENCE SCENARIO
 */

import { CelestialBody } from '../types';
import { KM_PER_AU, SOLAR_MASS_KG, JUPITER_MASS_KG } from '../units';

export function createMeridianPreset(): { bodies: CelestialBody[] } {
  // Distant Host Star
  const star: CelestialBody = {
    id: 'ash-veyr-star',
    name: 'Ash Veyr Central Star',
    type: 'star',
    massKg: SOLAR_MASS_KG * 0.9,
    radiusKm: 620000,
    luminosityW: 2.8e26,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fixed: true,
    color: '#ffe0aa',
    canonClassification: 'CANON EVENT STUDY',
    sourceRef: 'src/content/sections/cosmic-architecture.body.html',
    stableId: 'cosmic-architecture',
  };

  // Gas giant Virgil: Immense desaturated steel-blue and ash-gray gas giant
  const rVirgil = 3.2 * KM_PER_AU;
  const vVirgil = Math.sqrt((6.6743e-20 * star.massKg) / rVirgil);
  const virgil: CelestialBody = {
    id: 'virgil',
    name: 'Virgil',
    type: 'planet',
    classification: 'gas_giant',
    massKg: JUPITER_MASS_KG * 2.2, // Immense gas giant
    radiusKm: 78000,
    position: { x: rVirgil, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: vVirgil },
    color: '#465666', // Desaturated steel-blue and ash-gray
    atmosphereColor: '#688299',
    canonClassification: 'CANON STRUCTURE',
    sourceRef: 'src/content/sections/cosmic-architecture.body.html',
    stableId: 'cosmic-architecture',
  };

  // Meridian Station orbiting Virgil at 160,000 km
  const rStation = 160000;
  const vStationRel = Math.sqrt((6.6743e-20 * virgil.massKg) / rStation);
  const meridianStation: CelestialBody = {
    id: 'meridian-station',
    name: 'Meridian Station',
    type: 'station',
    massKg: 2e10, // 20 million tons industrial complex
    radiusKm: 250,
    primaryId: 'virgil',
    position: { x: virgil.position.x + rStation, y: 0, z: virgil.position.z },
    velocity: { x: virgil.velocity.x, y: 0, z: virgil.velocity.z + vStationRel },
    color: '#e5e9f0',
    canonClassification: 'CANON STRUCTURE',
    sourceRef: 'src/content/sections/cosmic-architecture.body.html',
    stableId: 'meridian-station',
  };

  return {
    bodies: [star, virgil, meridianStation],
  };
}
