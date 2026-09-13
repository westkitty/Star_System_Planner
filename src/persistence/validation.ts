/**
 * Deep structural validation for imported projects (BACK06).
 *
 * Returns every defect with a JSON-path locator instead of failing on the
 * first shallow check, so the import dialog can show precise, actionable
 * repair guidance.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkVector(path: string, value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) {
    issues.push({ path, message: 'expected {x,y,z} finite-number vector' });
  }
}

function checkBody(path: string, body: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(body)) {
    issues.push({ path, message: 'body must be an object' });
    return;
  }
  if (typeof body.id !== 'string' || body.id.length === 0) {
    issues.push({ path: `${path}.id`, message: 'body id must be a non-empty string' });
  }
  if (typeof body.name !== 'string' || body.name.length === 0) {
    issues.push({ path: `${path}.name`, message: 'body name must be a non-empty string' });
  }
  const validTypes = ['star', 'planet', 'dwarf_planet', 'moon', 'station', 'ship', 'black_hole', 'megastructure', 'hookshot_node'];
  if (typeof body.type !== 'string' || !validTypes.includes(body.type)) {
    issues.push({ path: `${path}.type`, message: `body type must be one of ${validTypes.join(', ')}` });
  }
  if (!isFiniteNumber(body.massKg) || (body.massKg as number) <= 0) {
    issues.push({ path: `${path}.massKg`, message: 'massKg must be a positive finite number' });
  }
  if (!isFiniteNumber(body.radiusKm) || (body.radiusKm as number) <= 0) {
    issues.push({ path: `${path}.radiusKm`, message: 'radiusKm must be a positive finite number' });
  }
  checkVector(`${path}.position`, body.position, issues);
  checkVector(`${path}.velocity`, body.velocity, issues);
  if (body.albedo !== undefined && (!isFiniteNumber(body.albedo) || (body.albedo as number) < 0 || (body.albedo as number) > 1)) {
    issues.push({ path: `${path}.albedo`, message: 'albedo must be within [0, 1]' });
  }
}

export function validateProjectStructure(project: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!isRecord(project)) {
    return { valid: false, issues: [{ path: '$', message: 'project root must be an object' }] };
  }
  if (typeof project.projectId !== 'string' || project.projectId.length === 0) {
    issues.push({ path: '$.projectId', message: 'projectId must be a non-empty string' });
  }
  if (typeof project.projectName !== 'string' || project.projectName.length === 0) {
    issues.push({ path: '$.projectName', message: 'projectName must be a non-empty string' });
  }
  if (!Array.isArray(project.branches) || project.branches.length === 0) {
    issues.push({ path: '$.branches', message: 'project must contain at least one timeline branch' });
  } else {
    const seenIds = new Set<string>();
    project.branches.forEach((branch, bi) => {
      const bPath = `$.branches[${bi}]`;
      if (!isRecord(branch)) {
        issues.push({ path: bPath, message: 'branch must be an object' });
        return;
      }
      if (typeof branch.id !== 'string' || branch.id.length === 0) {
        issues.push({ path: `${bPath}.id`, message: 'branch id must be a non-empty string' });
      } else if (seenIds.has(branch.id)) {
        issues.push({ path: `${bPath}.id`, message: `duplicate branch id "${branch.id}"` });
      } else {
        seenIds.add(branch.id);
      }
      if (!isRecord(branch.snapshot)) {
        issues.push({ path: `${bPath}.snapshot`, message: 'branch snapshot must be an object' });
        return;
      }
      const bodies = (branch.snapshot as Record<string, unknown>).bodies;
      if (!Array.isArray(bodies)) {
        issues.push({ path: `${bPath}.snapshot.bodies`, message: 'snapshot bodies must be an array' });
        return;
      }
      if (bodies.length > 512) {
        issues.push({ path: `${bPath}.snapshot.bodies`, message: 'snapshot exceeds 512-body safety limit' });
      }
      bodies.forEach((body, idx) => checkBody(`${bPath}.snapshot.bodies[${idx}]`, body, issues));
    });
    if (typeof project.activeBranchId === 'string' && !seenIds.has(project.activeBranchId)) {
      issues.push({ path: '$.activeBranchId', message: 'activeBranchId does not match any branch' });
    }
  }
  if (project.events !== undefined && !Array.isArray(project.events)) {
    issues.push({ path: '$.events', message: 'events must be an array when present' });
  }
  return { valid: issues.length === 0, issues };
}
