/**
 * .ssp.json Serialization and Schema Validation.
 */

import { SavedSystemProject } from './db';

export function exportProjectToJson(project: SavedSystemProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseAndValidateProjectJson(jsonStr: string): SavedSystemProject {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Project file root must be an object');
  }

  if (parsed.schemaVersion !== '1.0.0') {
    throw new Error(`Unsupported schema version: ${parsed.schemaVersion || 'missing'}`);
  }

  if (!parsed.projectId || !parsed.projectName) {
    throw new Error('Project must have projectId and projectName');
  }

  if (!Array.isArray(parsed.branches) || parsed.branches.length === 0) {
    throw new Error('Project must contain at least one timeline branch');
  }

  if (!parsed.activeBranchId) {
    parsed.activeBranchId = parsed.branches[0].id;
  }

  return parsed as SavedSystemProject;
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
