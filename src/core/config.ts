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

/**
 * Boot-time configuration guardrails (iteration 3, BACK09).
 *
 * Central tuning is only trustworthy when it is validated: every range
 * that could wedge the integrator, starve the worker, or invert a quality
 * threshold is checked here and reported at startup instead of failing
 * silently mid-session.
 */
export function validatePlannerConfig(): string[] {
  const issues: string[] = [];
  const c = PLANNER_CONFIG;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

  if (!finite(c.physics.fixedStepSec) || c.physics.fixedStepSec <= 0) {
    issues.push('physics.fixedStepSec must be a positive finite number');
  }
  if (!Number.isInteger(c.physics.maxSubstepsPerTick) || c.physics.maxSubstepsPerTick < 1 || c.physics.maxSubstepsPerTick > 512) {
    issues.push('physics.maxSubstepsPerTick must be an integer within [1, 512]');
  }
  if (!finite(c.physics.maxRealDeltaSec) || c.physics.maxRealDeltaSec <= 0) {
    issues.push('physics.maxRealDeltaSec must be positive');
  }
  if (!finite(c.physics.softeningKm) || c.physics.softeningKm < 0) {
    issues.push('physics.softeningKm must be non-negative');
  }
  if (!Number.isInteger(c.forecast.steps) || c.forecast.steps <= 0) {
    issues.push('forecast.steps must be a positive integer');
  }
  if (!finite(c.forecast.dtSeconds) || c.forecast.dtSeconds <= 0) {
    issues.push('forecast.dtSeconds must be positive');
  }
  if (!finite(c.forecast.minIntervalMs) || c.forecast.minIntervalMs < 0) {
    issues.push('forecast.minIntervalMs must be non-negative');
  }
  if (!finite(c.forecast.timeoutMs) || c.forecast.timeoutMs <= 0) {
    issues.push('forecast.timeoutMs must be positive');
  }
  if (!Number.isInteger(c.forecast.maxPointsPerBody) || c.forecast.maxPointsPerBody <= 0) {
    issues.push('forecast.maxPointsPerBody must be a positive integer');
  }
  if (!Number.isInteger(c.forecast.sensitivityFanCount) || c.forecast.sensitivityFanCount < 0) {
    issues.push('forecast.sensitivityFanCount must be a non-negative integer');
  }
  if (!finite(c.forecast.sensitivityPerturbation) || c.forecast.sensitivityPerturbation < 0) {
    issues.push('forecast.sensitivityPerturbation must be non-negative');
  }
  if (!finite(c.interaction.throwVelocitySmoothing) || c.interaction.throwVelocitySmoothing < 0 || c.interaction.throwVelocitySmoothing > 1) {
    issues.push('interaction.throwVelocitySmoothing must be within [0, 1]');
  }
  if (!Number.isInteger(c.interaction.throwSampleWindow) || c.interaction.throwSampleWindow <= 0) {
    issues.push('interaction.throwSampleWindow must be a positive integer');
  }
  if (!finite(c.interaction.holdDurationMs) || c.interaction.holdDurationMs <= 0) {
    issues.push('interaction.holdDurationMs must be positive');
  }
  if (!finite(c.interaction.orbitSensitivity) || c.interaction.orbitSensitivity <= 0) {
    issues.push('interaction.orbitSensitivity must be positive');
  }
  if (!Array.isArray(c.interaction.zoomRange) || !(c.interaction.zoomRange[0] < c.interaction.zoomRange[1])) {
    issues.push('interaction.zoomRange must be an ascending [min, max] pair');
  }
  if (!finite(c.persistence.autosaveIntervalMs) || c.persistence.autosaveIntervalMs <= 0) {
    issues.push('persistence.autosaveIntervalMs must be positive');
  }
  if (typeof c.persistence.autosaveSlotId !== 'string' || c.persistence.autosaveSlotId.length === 0) {
    issues.push('persistence.autosaveSlotId must be a non-empty string');
  }
  if (!Number.isInteger(c.persistence.maxChallengeRecords) || c.persistence.maxChallengeRecords <= 0) {
    issues.push('persistence.maxChallengeRecords must be a positive integer');
  }
  if (!finite(c.quality.maxPixelRatio) || !finite(c.quality.minPixelRatio) || c.quality.maxPixelRatio < c.quality.minPixelRatio) {
    issues.push('quality.maxPixelRatio must be finite and >= minPixelRatio');
  }
  if (!(c.quality.degradeFpsThreshold < c.quality.recoverFpsThreshold)) {
    issues.push('quality.degradeFpsThreshold must be below recoverFpsThreshold');
  }
  if (!Number.isInteger(c.quality.starfieldCount) || c.quality.starfieldCount < 0) {
    issues.push('quality.starfieldCount must be a non-negative integer');
  }
  if (!finite(c.discovery.conjunctionKm) || c.discovery.conjunctionKm <= 0) {
    issues.push('discovery.conjunctionKm must be positive');
  }
  if (!finite(c.discovery.conjunctionCooldownSec) || c.discovery.conjunctionCooldownSec < 0) {
    issues.push('discovery.conjunctionCooldownSec must be non-negative');
  }
  if (!finite(c.discovery.syzygyCooldownSec) || c.discovery.syzygyCooldownSec < 0) {
    issues.push('discovery.syzygyCooldownSec must be non-negative');
  }
  if (!finite(c.discovery.resonanceTolerance) || c.discovery.resonanceTolerance < 0 || c.discovery.resonanceTolerance > 1) {
    issues.push('discovery.resonanceTolerance must be within [0, 1]');
  }
  if (!finite(c.discovery.assistMinDvKmS) || c.discovery.assistMinDvKmS < 0) {
    issues.push('discovery.assistMinDvKmS must be non-negative');
  }
  if (!Number.isInteger(c.scrub.capacity) || c.scrub.capacity <= 0) {
    issues.push('scrub.capacity must be a positive integer');
  }
  if (!finite(c.scrub.intervalSec) || c.scrub.intervalSec <= 0) {
    issues.push('scrub.intervalSec must be positive');
  }
  return issues;
}
