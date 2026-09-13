/**
 * Central planner configuration (BACK12).
 *
 * Single source of truth for physics tuning, forecast budgets, interaction
 * feel, persistence cadence, and visual quality knobs. Replaces scattered
 * magic numbers across engine, workers, and interaction controllers.
 */

export interface PhysicsTuning {
  /** Base fixed physics step, seconds of sim time. */
  fixedStepSec: number;
  /** Safety budget of substeps per animation frame. */
  maxSubstepsPerTick: number;
  /** Clamp for real delta time (prevents spiral of death). */
  maxRealDeltaSec: number;
  /** Adaptive step ladder: [timeScaleThreshold, stepSeconds][]. */
  stepLadder: Array<[number, number]>;
  /** Plummer softening length in km. */
  softeningKm: number;
}

export interface ForecastTuning {
  /** Integration steps per forecast request. */
  steps: number;
  /** Seconds per forecast step. */
  dtSeconds: number;
  /** Minimum ms between worker requests (coalescing window). */
  minIntervalMs: number;
  /** Request timeout before falling back to sync forecast. */
  timeoutMs: number;
  /** Max trajectory points rendered per body. */
  maxPointsPerBody: number;
  /** Number of perturbed shadow universes in the sensitivity cloud. */
  sensitivityFanCount: number;
  /** Velocity perturbation fraction for sensitivity fans. */
  sensitivityPerturbation: number;
}

export interface InteractionTuning {
  /** EMA smoothing factor for throw velocity sampling. */
  throwVelocitySmoothing: number;
  /** Max throw samples retained. */
  throwSampleWindow: number;
  /** Default hold-to-confirm duration (ms) for destructive macros. */
  holdDurationMs: number;
  /** Camera orbit sensitivity (radians per pixel). */
  orbitSensitivity: number;
  /** Pinch zoom clamp [min, max] distance. */
  zoomRange: [number, number];
}

export interface PersistenceTuning {
  /** Autosave debounce interval in ms. */
  autosaveIntervalMs: number;
  /** IndexedDB project id for the autosave slot. */
  autosaveSlotId: string;
  /** Max completed-challenge records retained. */
  maxChallengeRecords: number;
}

export interface DiscoveryTuning {
  /** Pairwise separation (km) that counts as a close-approach conjunction. */
  conjunctionKm: number;
  /** Cooldown between repeat conjunction events for the same pair (sim-sec). */
  conjunctionCooldownSec: number;
  /** Cooldown between repeat syzygy events for the same triple (sim-sec). */
  syzygyCooldownSec: number;
  /** Resonance period-ratio tolerance (fraction). */
  resonanceTolerance: number;
  /** Minimum inertial Δv (km/s) worth celebrating as an assist. */
  assistMinDvKmS: number;
}

export interface ScrubTuning {
  /** Ring-buffer capacity (snapshots). */
  capacity: number;
  /** Sim-seconds between automatic captures. */
  intervalSec: number;
}

export interface QualityTuning {
  /** Max device pixel ratio before downscale. */
  maxPixelRatio: number;
  /** Min device pixel ratio under auto-quality. */
  minPixelRatio: number;
  /** FPS below which auto-quality degrades rendering. */
  degradeFpsThreshold: number;
  /** FPS above which auto-quality restores rendering. */
  recoverFpsThreshold: number;
  /** Background starfield density. */
  starfieldCount: number;
}

export const PLANNER_CONFIG = {
  physics: {
    fixedStepSec: 60,
    maxSubstepsPerTick: 64,
    maxRealDeltaSec: 0.1,
    stepLadder: [
      [10000, 4 * 3600],
      [1000, 3600],
      [100, 600],
      [10, 120],
    ] as Array<[number, number]>,
    softeningKm: 1000,
  } as PhysicsTuning,
  forecast: {
    steps: 400,
    dtSeconds: 3600,
    minIntervalMs: 250,
    timeoutMs: 2500,
    maxPointsPerBody: 500,
    sensitivityFanCount: 30,
    sensitivityPerturbation: 0.0005,
  } as ForecastTuning,
  interaction: {
    throwVelocitySmoothing: 0.35,
    throwSampleWindow: 12,
    holdDurationMs: 1800,
    orbitSensitivity: 0.006,
    zoomRange: [10, 15000],
  } as InteractionTuning,
  persistence: {
    autosaveIntervalMs: 5000,
    autosaveSlotId: 'system-autosave',
    maxChallengeRecords: 64,
  } as PersistenceTuning,
  quality: {
    maxPixelRatio: 2.0,
    minPixelRatio: 1.0,
    degradeFpsThreshold: 38,
    recoverFpsThreshold: 55,
    starfieldCount: 3500,
  } as QualityTuning,
  discovery: {
    conjunctionKm: 0.05 * 149597870.7,
    conjunctionCooldownSec: 86400,
    syzygyCooldownSec: 43200,
    resonanceTolerance: 0.015,
    assistMinDvKmS: 0.03,
  } as DiscoveryTuning,
  scrub: {
    capacity: 60,
    intervalSec: 5,
  } as ScrubTuning,
};

/** Resolve the adaptive physics step for a given time acceleration. */
export function stepSizeForTimeScale(timeScale: number): number {
  for (const [threshold, step] of PLANNER_CONFIG.physics.stepLadder) {
    if (timeScale >= threshold) return step;
  }
  return PLANNER_CONFIG.physics.fixedStepSec;
}
