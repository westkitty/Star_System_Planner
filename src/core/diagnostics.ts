/**
 * Structured diagnostics collector (iteration 3, BACK15).
 *
 * One honest snapshot for bug reports: capabilities, settings schema,
 * branch census, ledger volume, forecast health, monitor load shedding,
 * GPU disposal, and recent bus traffic — assembled from plain data so the
 * HUD stays a thin caller and tests can assert the shape.
 */

export interface DiagnosticsInput {
  capabilities?: unknown;
  projectName?: string;
  simTimeSec?: number;
  settingsVersion?: number;
  branchCount?: number;
  activeBranchId?: string;
  eventCount?: number;
  disposal?: unknown;
  forecastCache?: unknown;
  forecastHealth?: unknown;
  monitorLoad?: unknown;
  recentEvents?: unknown;
}

export function collectDiagnostics(input: DiagnosticsInput): Record<string, unknown> {
  return {
    capabilities: input.capabilities ?? null,
    projectName: input.projectName ?? 'unknown',
    simTimeSec: input.simTimeSec ?? 0,
    settingsSchemaVersion: input.settingsVersion ?? null,
    branches: {
      count: input.branchCount ?? 0,
      activeBranchId: input.activeBranchId ?? null,
    },
    eventCount: input.eventCount ?? 0,
    disposal: input.disposal ?? null,
    forecast: {
      cache: input.forecastCache ?? null,
      health: input.forecastHealth ?? null,
    },
    monitor: input.monitorLoad ?? null,
    recentEvents: input.recentEvents ?? [],
  };
}
