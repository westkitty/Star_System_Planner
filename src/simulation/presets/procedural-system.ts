/**
 * Seeded procedural star-system generator (GAME13).
 *
 * Builds a physically plausible miniature system — spectral-class star,
 * 2–5 planets on near-circular orbits with occasional moons, belts, and
 * rings — from any integer seed. Identical seeds always yield identical
 * systems, inviting seed-sharing between architects.
 */

import { AsteroidBelt, CelestialBody, PlanetClassification } from '../types';
import { EARTH_MASS_KG, G_KM, JUPITER_MASS_KG, KM_PER_AU, SOLAR_MASS_KG } from '../units';
import { SeededRng } from '../../core/seeded-rng';
import { SPECTRAL_CLASSES, SpectralClass } from '../../rendering/star-palette';

export interface ProceduralSystem {
  seed: number;
  starClass: SpectralClass;
  bodies: CelestialBody[];
  belts: AsteroidBelt[];
}

const SYSTEM_NAMES = [
  'Veyra', 'Halcyon', 'Drossmere', 'Illyria', 'Kestrel', 'Ondine', 'Sable', 'Tessaline',
  'Vexholm', 'Ysolde', 'Cairnhold', 'Duskvale', 'Emberfall', 'Frostmere', 'Gloaming', 'Holloway',
];

const PLANET_NAMES = [
  'Astra', 'Borealis', 'Cinder', 'Drift', 'Erebus', 'Fable', 'Gale', 'Haven',
  'Iris', 'Jove', 'Koda', 'Lumen', 'Mira', 'Nix', 'Ophir', 'Pell', 'Quill', 'Rhea',
];

const CLASSIFICATIONS: PlanetClassification[] = ['rocky', 'desert', 'oceanic', 'ice', 'gas_giant', 'scorched'];

const CLASS_COLORS: Record<PlanetClassification, string> = {
  rocky: '#9a8f7f',
  desert: '#d4a373',
  oceanic: '#2f7fd0',
  ice: '#bfe6f5',
  gas_giant: '#d8a05a',
  scorched: '#d46534',
  remnant: '#6b7280',
  artificial: '#e2e8f0',
};

function circularVelocityKms(starMassKg: number, distKm: number): number {
  return Math.sqrt((G_KM * starMassKg) / distKm);
}

export function createProceduralSystem(seed: number): ProceduralSystem {
  const rng = new SeededRng(seed);
  const systemName = rng.pick(SYSTEM_NAMES);
  const starClass = rng.pick(SPECTRAL_CLASSES.filter((c) => c.class !== 'O' && c.class !== 'B'));
  const starMass = starClass.massSolar * SOLAR_MASS_KG * rng.range(0.92, 1.08);
  const starRadius = starClass.radiusSolar * 696340 * rng.range(0.94, 1.06);

  const star: CelestialBody = {
    id: `proc-${seed}-star`,
    name: `${systemName} Prime`,
    type: 'star',
    massKg: starMass,
    radiusKm: starRadius,
    luminosityW: starClass.luminositySolar * 3.828e26,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    fixed: true,
    color: starClass.color,
    temperatureK: starClass.temperatureK,
    plannerClassification: 'NON-CANON SANDBOX',
  };

  const bodies: CelestialBody[] = [star];
  const belts: AsteroidBelt[] = [];
  const planetCount = rng.intRange(2, 5);
  const usedNames = new Set<string>();
  let orbitAu = rng.range(0.32, 0.5);

  for (let i = 0; i < planetCount; i++) {
    orbitAu *= rng.range(1.55, 2.1);
    const distKm = orbitAu * KM_PER_AU;
    const v = circularVelocityKms(starMass, distKm);
    const classification = rng.pick(CLASSIFICATIONS);
    const isGas = classification === 'gas_giant';
    let planetName = rng.pick(PLANET_NAMES);
    while (usedNames.has(planetName)) planetName = `${rng.pick(PLANET_NAMES)} ${rng.intRange(2, 9)}`;
    usedNames.add(planetName);

    const planet: CelestialBody = {
      id: `proc-${seed}-p${i}`,
      name: planetName,
      type: 'planet',
      classification,
      massKg: isGas ? JUPITER_MASS_KG * rng.range(0.3, 2.2) : EARTH_MASS_KG * rng.range(0.12, 3.4),
      radiusKm: isGas ? rng.range(42000, 78000) : rng.range(2400, 9200),
      position: { x: distKm * Math.cos(i * 2.1), y: 0, z: distKm * Math.sin(i * 2.1) },
      velocity: {
        x: -Math.sin(i * 2.1) * v * rng.range(0.97, 1.0),
        y: 0,
        z: Math.cos(i * 2.1) * v * rng.range(0.97, 1.0),
      },
      color: CLASS_COLORS[classification],
      atmosphereColor: classification === 'oceanic' ? '#49e7ff' : undefined,
      atmosphereDensity: classification === 'oceanic' || classification === 'ice' ? rng.range(0.4, 0.9) : undefined,
      albedo: rng.range(0.15, 0.55),
      greenhouseOffsetK: classification === 'oceanic' ? rng.range(10, 40) : rng.range(0, 12),
      plannerClassification: 'NON-CANON SANDBOX',
    };
    bodies.push(planet);

    // Occasional moon on a tight circular orbit (planet-relative velocity).
    if (!isGas && rng.nextFloat() < 0.45) {
      const moonDistKm = planet.radiusKm * rng.range(14, 26);
      const moonV = Math.sqrt((G_KM * planet.massKg) / moonDistKm);
      bodies.push({
        id: `proc-${seed}-p${i}-moon`,
        name: `${planetName} ${rng.pick(['Minor', 'Major', 'I', 'II'])}`,
        type: 'moon',
        classification: 'rocky',
        massKg: planet.massKg * rng.range(0.008, 0.03),
        radiusKm: planet.radiusKm * rng.range(0.2, 0.32),
        position: { x: planet.position.x + moonDistKm, y: 0, z: planet.position.z },
        velocity: { x: planet.velocity.x, y: 0, z: planet.velocity.z + moonV },
        color: '#99a3b0',
        albedo: 0.12,
        plannerClassification: 'NON-CANON SANDBOX',
      });
    }

    // Gas giants sometimes carry bright rings.
    if (isGas && rng.nextFloat() < 0.5) {
      planet.rings = [
        {
          id: `proc-${seed}-ring-${i}`,
          name: `${planetName} Ring`,
          innerRadiusKm: planet.radiusKm * 1.4,
          outerRadiusKm: planet.radiusKm * 2.3,
          normal: { x: 0, y: 1, z: 0 },
          color: '#d8c49a',
          opacity: 0.85,
        },
      ];
    }
  }

  // Occasional shattered belt between two middle orbits.
  if (planetCount >= 3 && rng.nextFloat() < 0.6) {
    const innerAu = orbitAu * 0.0 + (orbitAu / Math.pow(1.8, planetCount - 1)) * 2.2;
    belts.push({
      id: `proc-${seed}-belt`,
      name: `Shattered Verge of ${systemName}`,
      primaryId: star.id,
      innerRadiusKm: innerAu * KM_PER_AU,
      outerRadiusKm: innerAu * KM_PER_AU * 1.5,
      particleCount: 900,
      color: '#8a7f70',
      seed,
    });
  }

  return { seed, starClass, bodies, belts };
}
