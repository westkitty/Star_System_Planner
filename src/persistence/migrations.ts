/**
 * Save-schema versioning and migration pipeline (BACK05).
 *
 * Current schema: 1.1.0. Loader accepts any known historical version and
 * migrates forward with field-level defaults so old autosaves and shared
 * .ssp.json files never strand the user on "unsupported version".
 */

export const CURRENT_SCHEMA_VERSION = '1.1.0';

export interface MigrationResult {
  migrated: boolean;
  fromVersion: string;
  toVersion: string;
  notes: string[];
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrate100to110(project: AnyRecord, notes: string[]): void {
  // 1.1.0 guarantees visual flags introduced after the 1.0.0 autosaves.
  const visual = isRecord(project.visualSettings) ? project.visualSettings : {};
  project.visualSettings = {
    scaleMode: visual.scaleMode ?? 'readable',
    showFuture: visual.showFuture ?? true,
    showSensitivity: visual.showSensitivity ?? false,
    showGravityGrid: visual.showGravityGrid ?? false,
    ...visual,
  };
  // 1.1.0 guarantees simulation settings block.
  const sim = isRecord(project.simulationSettings) ? project.simulationSettings : {};
  project.simulationSettings = {
    enableCollisions: sim.enableCollisions ?? true,
    timeScale: sim.timeScale ?? 1.0,
    ...sim,
  };
  // Backfill per-body canonical defaults so migrated bodies render honestly.
  const branches = Array.isArray(project.branches) ? project.branches : [];
  for (const branch of branches) {
    if (!isRecord(branch)) continue;
    const snapshot = isRecord(branch.snapshot) ? branch.snapshot : null;
    const bodies = snapshot && Array.isArray(snapshot.bodies) ? snapshot.bodies : [];
    for (const body of bodies) {
      if (!isRecord(body)) continue;
      if (body.plannerClassification === undefined && body.canonClassification !== undefined) {
        body.plannerClassification = body.canonClassification;
      }
      if (body.albedo === undefined) body.albedo = 0.3;
      if (body.greenhouseOffsetK === undefined) body.greenhouseOffsetK = 0;
    }
  }
  notes.push('migrated 1.0.0 → 1.1.0 (visual/sim defaults, body thermal defaults)');
  project.schemaVersion = '1.1.0';
}

export function migrateProject(project: unknown): MigrationResult {
  if (!isRecord(project)) {
    throw new Error('Project root must be an object');
  }
  const rawVersion = typeof project.schemaVersion === 'string' ? project.schemaVersion : 'missing';
  const notes: string[] = [];

  if (rawVersion === '1.1.0') {
    return { migrated: false, fromVersion: rawVersion, toVersion: '1.1.0', notes };
  }
  if (rawVersion === '1.0.0') {
    migrate100to110(project, notes);
    return { migrated: true, fromVersion: '1.0.0', toVersion: CURRENT_SCHEMA_VERSION, notes };
  }
  throw new Error(
    `Unsupported schema version: ${rawVersion} (this planner reads 1.0.0–${CURRENT_SCHEMA_VERSION})`
  );
}
