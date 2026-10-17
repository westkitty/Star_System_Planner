import { describe, expect, it } from 'vitest';
import { seedAtlas } from '../../map-of-the-all/atlas-data.js';
import { createPlannerHandoff } from '../../map-of-the-all/planner-handoff.js';
import { parseAndValidateProjectJson, parseProjectWithDiagnostics } from '../persistence/export-import';

// This test runs the actual existing planner importer, not an approximated schema.
describe('Map of the All -> System Planner (.ssp.json)', () => {
  it('accepts an explicitly hypothetical atlas star-system export without canon promotion', () => {
    const atlas = seedAtlas();
    const project = createPlannerHandoff(atlas, 'perseus-confluence-system-1', '2026-10-17T08:00:00.000Z');
    const serialized = JSON.stringify(project);
    const diagnostics = parseProjectWithDiagnostics(serialized);
    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.issues).toEqual([]);
    const parsed = parseAndValidateProjectJson(serialized);
    expect(parsed.branches).toHaveLength(1);
    const bodies = parsed.branches[0].snapshot.bodies;
    expect(bodies).toHaveLength(4);
    expect(bodies.every(b => b.plannerClassification === 'NON-CANON SANDBOX')).toBe(true);
    expect(bodies.every(b => b.sourceCanonStatus === 'unknown')).toBe(true);
    expect(bodies.every(b => b.unauthored_in_source === true)).toBe(true);
    expect(bodies[1].primaryId).toBe(bodies[0].id);
  });
});
