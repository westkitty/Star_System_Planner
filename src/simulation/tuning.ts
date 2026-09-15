/**
 * Central Simulation & Interaction Tuning Constants.
 *
 * Invariants:
 * - Single authoritative home for numeric policy decisions previously scattered
 *   across the engine, interaction controllers, and renderers.
 * - Values are deliberately conservative for a 120Hz tablet render budget.
 */

// --- Ledger -------------------------------------------------------------------
/** Maximum retained causal ledger events (oldest trimmed beyond this). */
export const MAX_LEDGER_EVENTS = 600;

// --- Time ----------------------------------------------------------------------
/** Commanded time scales offered by the TimelineBar (×). */
export const TIME_SCALE_PRESETS = [1, 10, 100, 1000, 10000, 100000] as const;

/** Exponential slew applied so commanded time-scale changes ease in (per-second). */
export const TIME_SCALE_SLEW_PER_SEC = 3.0;

// --- Orbital regime monitors ----------------------------------------------------
/** Distance from the system barycenter beyond which a body counts as ejected. */
export const EJECTION_DISTANCE_AU = 150;

/** Enable Roche-limit fragmentation by default (settings can override). */
export const ROCHE_BREAKING_ENABLED_DEFAULT = true;

/** Pair must come within (sum of radii × this factor) before a Roche check runs. */
export const ROCHE_CHECK_RADIUS_FACTOR = 60;

/** Minimum body radius eligible for Roche fragmentation (skip trivial dust). */
export const ROCHE_MIN_RADIUS_KM = 50;

// --- Forecasting ----------------------------------------------------------------
/** Minimum interval between worker forecast dispatches (ms). */
export const FORECAST_MIN_INTERVAL_MS = 180;

/** Default and selectable forecast horizons (worker steps, dt seconds, label). */
export const FORECAST_HORIZONS = [
  { id: 'near', label: 'NEAR (3 d)', steps: 180, dtSeconds: 300 },
  { id: 'standard', label: 'STANDARD (8 d)', steps: 240, dtSeconds: 300 },
  { id: 'deep', label: 'DEEP (40 d)', steps: 360, dtSeconds: 1800 },
] as const;

export type ForecastHorizonId = (typeof FORECAST_HORIZONS)[number]['id'];

// --- Visual systems ---------------------------------------------------------------
/** Points retained per body motion trail. */
export const TRAIL_DEFAULT_POINTS = 220;
export const TRAIL_MIN_POINTS = 0;
export const TRAIL_MAX_POINTS = 600;

/** Screen-space label visibility gate (display units). */
export const LABEL_MAX_DISTANCE_UNITS = 2600;

/** Autopilot insertion radius tolerance band (fraction of target radius). */
export const AUTOPILOT_ARRIVAL_TOLERANCE = 0.03;
