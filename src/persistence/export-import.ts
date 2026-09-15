/**
 * .ssp.json Serialization and Schema Validation.
 */

import { CURRENT_SCHEMA_VERSION, SavedSystemProject } from './db';
import { migrateProject } from './migrations';
import { ValidationIssue, validateProjectStructure } from './validation';
import { CelestialBody, Vector3D } from '../simulation/types';

export function exportProjectToJson(project: SavedSystemProject): string {
  return JSON.stringify(project, null, 2);
}

export interface ImportResult {
  project: SavedSystemProject;
  migrated: boolean;
  migrationNotes: string[];
}

export function parseAndValidateProjectJson(jsonStr: string): SavedSystemProject {
  return sanitizeProject(parseProjectWithMigration(jsonStr).project);
}

function finiteVector(value: unknown, label: string): Vector3D {
  if (!value || typeof value !== 'object') throw new Error(`${label} is missing`);
  const vector = value as Record<string, unknown>;
  for (const axis of ['x', 'y', 'z']) if (typeof vector[axis] !== 'number' || !Number.isFinite(vector[axis])) throw new Error(`${label}.${axis} must be a finite number`);
  return { x: vector.x as number, y: vector.y as number, z: vector.z as number };
}

/** Deep import guard for the values that enter the physics engine. */
export function sanitizeProject(project: SavedSystemProject): SavedSystemProject {
  project.projectName = typeof project.projectName === 'string' && project.projectName.trim() ? project.projectName.trim().slice(0, 80) : 'Unnamed System';
  for (const branch of project.branches) {
    if (!branch?.snapshot || !Array.isArray(branch.snapshot.bodies)) throw new Error(`Branch "${branch?.name || branch?.id || '?'}" has no valid body snapshot`);
    branch.snapshot.bodies = branch.snapshot.bodies.map((raw, index) => {
      const body = raw as CelestialBody;
      const label = body?.name ? `body "${body.name}"` : `body #${index + 1}`;
      if (!body || !body.id || !body.name || !Number.isFinite(body.massKg) || body.massKg <= 0) throw new Error(`${label}: massKg must be a positive finite number`);
      if (!Number.isFinite(body.radiusKm) || body.radiusKm <= 0) throw new Error(`${label}: radiusKm must be a positive finite number`);
      return { ...body, name: body.name.slice(0, 80), position: finiteVector(body.position, `${label}.position`), velocity: finiteVector(body.velocity, `${label}.velocity`) };
    });
  }
  if (!project.branches.some((branch) => branch.id === project.activeBranchId)) project.activeBranchId = project.branches[0].id;
  return project;
}

export function buildProjectFilename(projectName: string, dateIso = new Date().toISOString()): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'system'}-${dateIso.slice(0, 10)}.ssp.json`;
}

/**
 * Non-throwing parse + migrate + validate (iteration 3, BACK03).
 *
 * Returns structured diagnostics so the import dialog can render a
 * precise repair list instead of a single opaque error toast.
 */
export interface ImportDiagnostics {
  ok: boolean;
  project: SavedSystemProject | null;
  migrated: boolean;
  migrationNotes: string[];
  issues: ValidationIssue[];
}

export function parseProjectWithDiagnostics(jsonStr: string): ImportDiagnostics {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      project: null,
      migrated: false,
      migrationNotes: [],
      issues: [{ path: '$.json', message: `Invalid JSON syntax: ${message}` }],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      project: null,
      migrated: false,
      migrationNotes: [],
      issues: [{ path: '$', message: 'Project file root must be an object' }],
    };
  }

  const wasLegacy = (parsed as { schemaVersion?: unknown }).schemaVersion === '1.0.0';
  let migration: { migrated: boolean; notes: string[] };
  try {
    migration = migrateProject(parsed);
  } catch (err) {
    // Iteration 3 (BACK03): migration failures are diagnostics, not crashes —
    // the import dialog shows them instead of the generic failure box.
    return {
      ok: false,
      project: null,
      migrated: false,
      migrationNotes: [],
      issues: [{ path: 'schemaVersion', message: err instanceof Error ? err.message : String(err) }],
    };
  }
  const report = validateProjectStructure(parsed);
  if (!report.valid) {
    return {
      ok: false,
      project: null,
      migrated: migration.migrated,
      migrationNotes: migration.notes,
      issues: report.issues,
    };
  }

  const project = parsed as SavedSystemProject;
  if (wasLegacy) {
    project.schemaVersion = CURRENT_SCHEMA_VERSION;
    project.visualSettings = { ...project.visualSettings, showXRay: false, showLabels: false, showTrails: false, showHabitableZone: false };
  }
  if (!project.activeBranchId) {
    project.activeBranchId = project.branches[0].id;
  }
  return { ok: true, project, migrated: migration.migrated, migrationNotes: migration.notes, issues: [] };
}

/**
 * Parse, migrate to the current schema, and deep-validate (BACK05/BACK06).
 * Throws a single actionable error aggregating every structural defect.
 */
export function parseProjectWithMigration(jsonStr: string): ImportResult {
  const diag = parseProjectWithDiagnostics(jsonStr);
  if (!diag.ok || !diag.project) {
    const details = diag.issues
      .slice(0, 8)
      .map((i) => `${i.path}: ${i.message}`)
      .join('\n');
    const more = diag.issues.length > 8 ? `\n…plus ${diag.issues.length - 8} more issues` : '';
    throw new Error(`Project validation failed with ${diag.issues.length} issue(s):\n${details}${more}`);
  }
  return { project: diag.project, migrated: diag.migrated, migrationNotes: diag.migrationNotes };
}

export function downloadProjectFile(project: SavedSystemProject): void {
  const jsonStr = exportProjectToJson(project);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = buildProjectFilename(project.projectName);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
