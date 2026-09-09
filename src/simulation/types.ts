/**
 * Core simulation types, physical states, structures, and event models.
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type BodyType = 
  | 'star'
  | 'planet'
  | 'dwarf_planet'
  | 'moon'
  | 'station'
  | 'ship'
  | 'black_hole'
  | 'megastructure'
  | 'hookshot_node';

export type PlanetClassification = 
  | 'rocky'
  | 'desert'
  | 'oceanic'
  | 'ice'
  | 'gas_giant'
  | 'scorched'
  | 'remnant'
  | 'artificial';

export type CanonClassification =
  | 'CANON MECHANIC'
  | 'CANON STRUCTURE'
  | 'CANON EVENT STUDY'
  | 'CANON OVERLAY'
  | 'CANON-INSPIRED SANDBOX'
  | 'REFERENCE ONLY'
  | 'NON-CANON SANDBOX';

export interface RingStructure {
  id: string;
  name: string;
  innerRadiusKm: number;
  outerRadiusKm: number;
  isBloodRing?: boolean; // Drakken vitrified crimson scar
  normal: Vector3D;
  color?: string;
  opacity?: number;
}

export interface CelestialBody {
  id: string;
  name: string;
  type: BodyType;
  massKg: number;
  radiusKm: number;
  position: Vector3D; // km
  velocity: Vector3D; // km/s
  fixed?: boolean; // Anchored in space if true
  primaryId?: string | null; // Optional reference body ID

  // Thermal & optical properties
  luminosityW?: number; // Watts (primarily for stars)
  albedo?: number; // 0.0 - 1.0 (defaults to 0.3)
  greenhouseOffsetK?: number; // Kelvin added by atmosphere
  temperatureK?: number; // Current calculated equilibrium temp

  // Visual metadata
  classification?: PlanetClassification;
  color: string;
  rings?: RingStructure[];
  atmosphereColor?: string;
  atmosphereDensity?: number;
  surfaceSeed?: number;

  // Starsilk & Canon metadata
  starsilkBleed?: number; // 0.0 - 1.0 (intensity of azure filament activity)
  isCollapsedSingularity?: boolean;
  canonClassification?: CanonClassification;
  sourceRef?: string;
  stableId?: string;
}

export interface AsteroidBelt {
  id: string;
  name: string;
  primaryId: string;
  innerRadiusKm: number;
  outerRadiusKm: number;
  particleCount: number;
  color: string;
  seed: number;
}

export interface HookshotRoute {
  id: string;
  nodeAId: string;
  nodeBId: string;
  tensionState: 'slack' | 'tensioned' | 'strained' | 'snapped';
  activeTransitCount: number;
}

export interface ConsequenceEvent {
  id: string;
  timestampSec: number;
  type: 
    | 'body_created'
    | 'body_removed'
    | 'throw_released'
    | 'collision'
    | 'orbit_unbound'
    | 'roche_violation'
    | 'hill_instability'
    | 'temperature_shift'
    | 'branch_fork'
    | 'starsilk_pull'
    | 'heliocide_triggered'
    | 'siege_wall_locked'
    | 'hookshot_latched';
  title: string;
  description: string;
  bodyIds?: string[];
  severity: 'info' | 'caution' | 'catastrophe';
}

export interface OsculatingElements {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  periapsisKm: number;
  apoapsisKm: number;
  periodSec: number;
  isBound: boolean;
  isHyperbolicEscape: boolean;
  trueAnomalyDeg: number;
  meanMotionRadSec: number;
  hillRadiusKm: number | null;
  rocheLimitKm: number | null;
  equilibriumTempK: number | null;
}

export interface SimulationSnapshot {
  timestampSec: number;
  bodies: CelestialBody[];
  belts?: AsteroidBelt[];
  hookshotRoutes?: HookshotRoute[];
}
