/**
 * .ssp.json Serialization and Schema Validation.
 */

import { SavedSystemProject } from './db';
import { migrateProject } from './migrations';
import { ValidationIssue, validateProjectStructure } from './validation';

export function exportProjectToJson(project: SavedSystemProject): string {
  return JSON.stringify(project, null, 2);
}

export interface ImportResult {
  project: SavedSystemProject;
  migrated: boolean;
  migrationNotes: string[];
}

export function parseAndValidateProjectJson(jsonStr: string): SavedSystemProject {
  return parseProjectWithMigration(jsonStr).project;
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

  const cleanName = project.projectName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const filename = `${cleanName || 'system'}.ssp.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
