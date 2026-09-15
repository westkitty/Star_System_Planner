import { describe, it, expect } from 'vitest';
import { parseAndValidateProjectJson, sanitizeProject, buildProjectFilename } from '../persistence/export-import';
import { createSerializableProject } from '../persistence/serializer';
import { SimulationEngine } from '../simulation/engine';
import { BranchManager } from '../branching/branch-manager';
import { createDemonstrationSystem } from '../simulation/presets/demo-system';
import { CURRENT_SCHEMA_VERSION } from '../persistence/db';

function liveProjectPayload() {
  const preset = createDemonstrationSystem();
  const engine = new SimulationEngine(preset.bodies, { enableCollisions: true });
  engine.belts = preset.belts ?? [];
  const mgr = new BranchManager(engine, 'Prime Timeline');
  return createSerializableProject(
    'Persistence Probe',
    mgr,
    engine,
    { scaleMode: 'readable', showFuture: true, showSensitivity: false, showGravityGrid: false },
    { target: { x: 1, y: 2, z: 3 }, distance: 420, viewMode: 'inertial' },
    'proj-probe'
  );
}

describe('Schema migration & deep sanitization (adversarial persistence)', () => {
  it('CURRENT_SCHEMA_VERSION is the live 1.1.0 and round-trips', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe('1.1.0');
    const payload = liveProjectPayload();
    expect(payload.schemaVersion).toBe('1.1.0');
    const parsed = parseAndValidateProjectJson(JSON.stringify(payload));
    expect(parsed.schemaVersion).toBe('1.1.0');
    expect(parsed.projectName).toBe('Persistence Probe');
    expect(parsed.branches.length).toBeGreaterThan(0);
  });

  it('Migrates a legacy 1.0.0 project: fills lens defaults and stamps 1.1.0', () => {
    const payload = liveProjectPayload();
    const legacy = { ...JSON.parse(JSON.stringify(payload)), schemaVersion: '1.0.0' };
    // legacy projects never carried the lens block
    legacy.visualSettings = { scaleMode: 'readable', showFuture: true, showSensitivity: false };
    const parsed = parseAndValidateProjectJson(JSON.stringify(legacy));
    expect(parsed.schemaVersion).toBe('1.1.0');
    expect(parsed.visualSettings.showLabels).toBeDefined();
    expect(parsed.visualSettings.showTrails).toBeDefined();
  });

  it('Rejects a body with non-finite mass instead of importing wreckage', () => {
    const payload = liveProjectPayload();
    const body = payload.branches[0].snapshot.bodies[0];
    (body as any).massKg = Number.NaN;
    expect(() => sanitizeProject(JSON.parse(JSON.stringify(payload)))).toThrow(/mass/i);
  });

  it('Rejects negative radius with a descriptive error', () => {
    const payload = liveProjectPayload();
    payload.branches[0].snapshot.bodies[1].radiusKm = -42;
    expect(() => sanitizeProject(JSON.parse(JSON.stringify(payload)))).toThrow(/radius/i);
  });

  it('Rejects Infinity inside a velocity vector', () => {
    const payload = liveProjectPayload();
    payload.branches[0].snapshot.bodies[2].velocity.x = Number.POSITIVE_INFINITY;
    expect(() => sanitizeProject(JSON.parse(JSON.stringify(payload)))).toThrow();
  });

  it('Repairs a corrupt activeBranchId instead of crashing the loader', () => {
    const payload = liveProjectPayload();
    (payload as any).activeBranchId = 'branch-nonexistent';
    const parsed = sanitizeProject(JSON.parse(JSON.stringify(payload)));
    expect(parsed.branches.some(b => b.id === parsed.activeBranchId)).toBe(true);
  });

  it('Rejects oversized project names by truncating, never throwing', () => {
    const payload = liveProjectPayload();
    (payload as any).projectName = 'S'.repeat(5000);
    const parsed = sanitizeProject(JSON.parse(JSON.stringify(payload)));
    expect(parsed.projectName.length).toBeLessThanOrEqual(80);
  });

  it('Export filenames are slugs — no path traversal or markup injection possible', () => {
    const name = buildProjectFilename('../../etc/evil<script> name', '2026-09-15T00:00:00Z');
    expect(name).not.toContain('..');
    expect(name).not.toContain('<');
    expect(name).not.toContain('/');
    expect(name).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.ssp\.json$/);
    expect(buildProjectFilename('   ', '2026-09-15T00:00:00Z')).toBe('system-2026-09-15.ssp.json');
  });

  it('Accepts garbage JSON with a parse error, not a crash', () => {
    expect(() => parseAndValidateProjectJson('{"schemaVersion":"9.9.9"}')).toThrow();
    expect(() => parseAndValidateProjectJson('totally not json')).toThrow();
  });
});
