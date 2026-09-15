/**
 * .ssp.json Serialization, Schema Migration, and Defensive Validation.
 *
 * Import pipeline:
 *   parse JSON -> schema version gate (+ 1.0.0 -> 1.1.0 migration)
 *   -> deep numeric sanitization (reject NaN/Infinity, non-positive masses/radii)
 *   -> structured project.
 */

import { CURRENT_SCHEMA_VERSION, SavedSystemProject } from './db';
import { CelestialBody, Vector3D } from '../simulation/types';

export function exportProjectToJson(project: SavedSystemProject): string {
  return JSON.stringify(project, null, 2);
}

function assertVectorFinite(v: any, label: string): Vector3D {
  if (!v || typeof v !== 'object') {
    throw new Error(`${label} is missing`);
  }
  for (const axis of ['x', 'y', 'z']) {
    if (typeof v[axis] !== 'number' || !Number.isFinite(v[axis])) {
      throw new Error(`${label}.${axis} must be a finite number`);
    }
  }
  return { x: v.x, y: v.y, z: v.z };
}

function sanitizeBody(raw: any, index: number): CelestialBody {
  const label = raw?.name ? `body "${raw.name}"` : `body #${index + 1}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${label}: malformed record`);
  if (typeof raw.id !== 'string' || !raw.id) throw new Error(`${label}: missing id`);
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error(`${label}: missing name`);
  if (typeof raw.massKg !== 'number' || !Number.isFinite(raw.massKg) || raw.massKg <= 0) {
    throw new Error(`${label}: massKg must be a positive finite number`);
  }
  if (typeof raw.radiusKm !== 'number' || !Number.isFinite(raw.radiusKm) || raw.radiusKm <= 0) {
    throw new Error(`${label}: radiusKm must be a positive finite number`);
  }
  const position = assertVectorFinite(raw.position, `${label}.position`);
  const velocity = assertVectorFinite(raw.velocity, `${label}.velocity`);
  return {
    ...raw,
    name: raw.name.slice(0, 80),
    position,
    velocity,
    color: typeof raw.color === 'string' ? raw.color : '#9aa5b1',
    massKg: raw.massKg,
    radiusKm: raw.radiusKm,
  };
}

/** Validate and sanitize the active system payload deeply enough to protect the engine. */
export function sanitizeProject(project: SavedSystemProject): SavedSystemProject {
  // Project-level invariants: bounded name and present id
  if (typeof project.projectName !== 'string' || project.projectName.trim().length === 0) {
    project.projectName = 'Unnamed System';
  } else {
    project.projectName = project.projectName.trim().slice(0, 80);
  }
  for (const branch of project.branches) {
    if (!branch?.snapshot || !Array.isArray(branch.snapshot.bodies)) {
      throw new Error(`Branch "${branch?.name || branch?.id || '?'}" has no valid body snapshot`);
    }
    branch.snapshot.bodies = branch.snapshot.bodies.map((b: any, i: number) => sanitizeBody(b, i));
    if (!Array.isArray(branch.events)) branch.events = [];
    if (typeof branch.snapshot.timestampSec !== 'number' || !Number.isFinite(branch.snapshot.timestampSec)) {
      throw new Error(`Branch "${branch.name}" has an invalid simulation timestamp`);
    }
  }
  if (!project.branches.some(b => b.id === project.activeBranchId)) {
    project.activeBranchId = project.branches[0].id;
  }
  return project;
}

/**
 * Migrate older accepted schemas forward to the current writer schema.
 */
export function migrateProjectSchema(parsed: any): SavedSystemProject {
  if (parsed.schemaVersion === '1.0.0') {
    return {
      ...parsed,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      visualSettings: {
        ...parsed.visualSettings,
        showXRay: parsed.visualSettings?.showXRay ?? false,
        showLabels: parsed.visualSettings?.showLabels ?? false,
        showTrails: parsed.visualSettings?.showTrails ?? false,
        showHabitableZone: parsed.visualSettings?.showHabitableZone ?? false,
      },
    };
  }
  return parsed as SavedSystemProject;
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

  if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION && parsed.schemaVersion !== '1.0.0') {
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

  const migrated = migrateProjectSchema(parsed);
  return sanitizeProject(migrated);
}

/** Pure, testable export filename builder (slug + date stamp, no path injection). */
export function buildProjectFilename(projectName: string, dateIso?: string): string {
  const cleanName = projectName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const stamp = (dateIso ?? new Date().toISOString()).slice(0, 10);
  return `${cleanName || 'system'}-${stamp}.ssp.json`;
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
