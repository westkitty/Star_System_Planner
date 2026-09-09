/**
 * Polished Built-in Demonstration System.
 * 
 * Clearly Labeled: NON-CANON DEMONSTRATION
 * 
 * Features:
 * - Central luminous star (Kallisto Prime)
 * - Scorched inner world (Pyros)
 * - Ocean-bearing terrestrial world (Thera) with atmospheric rim
 * - Resonant moon (Selene)
 * - Orbital habitat (Aegis Station)
 * - Dense instanced asteroid belt (The Shattered Verge)
 * - Outer ringed gas giant (Aurelia) with high-contrast rings
 */

import { AsteroidBelt, CelestialBody } from '../types';
import { KM_PER_AU, SOLAR_MASS_KG, EARTH_MASS_KG, JUPITER_MASS_KG } from '../units';

export function createDemonstrationSystem(): { bodies: CelestialBody[]; belts: AsteroidBelt[] } {
  // Central Star
  const star: CelestialBody = {
    id: 'kallisto-prime',
    name: 'Kallisto Prime',
    type: 'star',
    massKg: SOLAR_MASS_KG * 1.05,
    radiusKm: 720000,
    luminosityW: 4.1e26,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fixed: true,
    color: '#ffcc33',
    temperatureK: 5850,
    canonClassification: 'NON-CANON SANDBOX',
  };

  // Inner Scorched Planet: Pyros at 0.42 AU
  const rPyros = 0.42 * KM_PER_AU;
  const vPyros = Math.sqrt((6.6743e-20 * star.massKg) / rPyros);
  const pyros: CelestialBody = {
    id: 'pyros',
    name: 'Pyros',
    type: 'planet',
    classification: 'scorched',
    massKg: EARTH_MASS_KG * 0.15,
    radiusKm: 3400,
    position: { x: rPyros, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: vPyros },
    color: '#d46534',
    canonClassification: 'NON-CANON SANDBOX',
  };

  // Habitable Ocean World: Thera at 1.05 AU
  const rThera = 1.05 * KM_PER_AU;
  const vThera = Math.sqrt((6.6743e-20 * star.massKg) / rThera);
  const thera: CelestialBody = {
    id: 'thera',
    name: 'Thera',
    type: 'planet',
    classification: 'oceanic',
    massKg: EARTH_MASS_KG * 1.1,
    radiusKm: 6600,
    position: { x: 0, y: 0, z: rThera },
    velocity: { x: -vThera, y: 0, z: 0 },
    color: '#1b64b3',
    atmosphereColor: '#49e7ff',
    atmosphereDensity: 1.0,
    canonClassification: 'NON-CANON SANDBOX',
  };

  // Moon: Selene orbiting Thera at 384,000 km
  const rMoon = 450000;
  const vMoonRel = Math.sqrt((6.6743e-20 * thera.massKg) / rMoon);
  const selene: CelestialBody = {
    id: 'selene',
    name: 'Selene',
    type: 'moon',
    classification: 'rocky',
    massKg: 7.35e22,
    radiusKm: 1737,
    primaryId: 'thera',
    position: { x: thera.position.x + rMoon, y: 0, z: thera.position.z },
    velocity: { x: thera.velocity.x, y: 0, z: thera.velocity.z + vMoonRel },
    color: '#b0b8c4',
    canonClassification: 'NON-CANON SANDBOX',
  };

  // Orbital Station: Aegis Station in low Thera orbit at 25,000 km
  const rStation = 35000;
  const vStationRel = Math.sqrt((6.6743e-20 * thera.massKg) / rStation);
  const aegisStation: CelestialBody = {
    id: 'aegis-station',
    name: 'Aegis Orbital Complex',
    type: 'station',
    massKg: 5e9, // 5 million tons
    radiusKm: 120,
    primaryId: 'thera',
    position: { x: thera.position.x, y: 0, z: thera.position.z + rStation },
    velocity: { x: thera.velocity.x - vStationRel, y: 0, z: thera.velocity.z },
    color: '#ffffff',
    canonClassification: 'NON-CANON SANDBOX',
  };

  // Outer Gas Giant: Aurelia at 2.8 AU with Ring
  const rAurelia = 2.8 * KM_PER_AU;
  const vAurelia = Math.sqrt((6.6743e-20 * star.massKg) / rAurelia);
  const aurelia: CelestialBody = {
    id: 'aurelia',
    name: 'Aurelia',
    type: 'planet',
    classification: 'gas_giant',
    massKg: JUPITER_MASS_KG * 0.85,
    radiusKm: 62000,
    position: { x: -rAurelia, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: -vAurelia },
    color: '#cfa976',
    atmosphereColor: '#e0c99f',
    canonClassification: 'NON-CANON SANDBOX',
    rings: [
      {
        id: 'aurelia-ring',
        name: 'The Golden Veil',
        innerRadiusKm: 85000,
        outerRadiusKm: 165000,
        normal: { x: 0, y: 1, z: 0 },
        color: '#d6b88d',
        opacity: 0.8,
      },
    ],
  };

  // Asteroid Belt between 1.6 AU and 2.2 AU
  const belt: AsteroidBelt = {
    id: 'shattered-verge',
    name: 'The Shattered Verge',
    primaryId: 'kallisto-prime',
    innerRadiusKm: 1.65 * KM_PER_AU,
    outerRadiusKm: 2.15 * KM_PER_AU,
    particleCount: 1500,
    color: '#8b8e96',
    seed: 424242,
  };

  return {
    bodies: [star, pyros, thera, selene, aegisStation, aurelia],
    belts: [belt],
  };
}
