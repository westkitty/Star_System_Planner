/**
 * .ssp.json Serialization and Schema Validation.
 */

import { SavedSystemProject } from './db';
import { migrateProject } from './migrations';
import { validateProjectStructure } from './validation';

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
 * Parse, migrate to the current schema, and deep-validate (BACK05/BACK06).
 * Throws a single actionable error aggregating every structural defect.
 */
export function parseProjectWithMigration(jsonStr: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON syntax: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Project file root must be an object');
  }

  const migration = migrateProject(parsed);

  const report = validateProjectStructure(parsed);
  if (!report.valid) {
    const details = report.issues
      .slice(0, 8)
      .map((i) => `${i.path}: ${i.message}`)
      .join('\n');
    const more = report.issues.length > 8 ? `\n…plus ${report.issues.length - 8} more issues` : '';
    throw new Error(`Project validation failed with ${report.issues.length} issue(s):\n${details}${more}`);
  }

  const project = parsed as SavedSystemProject;
  if (!project.activeBranchId) {
    project.activeBranchId = project.branches[0].id;
  }

  return { project, migrated: migration.migrated, migrationNotes: migration.notes };
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
