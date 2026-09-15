import { describe, expect, it } from 'vitest';
import { ScaleTransform } from '../rendering/scale-transform';
import { TrajectoryRenderer } from '../rendering/trajectory-renderer';
import { CelestialBody } from '../simulation/types';
import { G_KM, KM_PER_AU, SOLAR_MASS_KG } from '../simulation/units';
import {
  appendFlightStep,
  createFlightPlan,
  makeNudgeStep,
  previewFlightPlan,
} from '../simulation/flight-director';

const star: CelestialBody = { id: 'star', name: 'Sol', type: 'star', massKg: SOLAR_MASS_KG, radiusKm: 696000, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, color: '#fff' };
const speed = Math.sqrt((G_KM * star.massKg) / KM_PER_AU);
const craft: CelestialBody = { id: 'craft', name: 'Surveyor', type: 'station', massKg: 1e18, radiusKm: 10, primaryId: star.id, position: { x: KM_PER_AU, y: 0, z: 0 }, velocity: { x: 0, y: speed, z: 0 }, color: '#8cf' };

describe('Iteration 4 WOW-01 ghost flight path', () => {
  it('applies queued maneuvers to clones without mutating live bodies', () => {
    const source = [star, craft];
    const before = JSON.stringify(source);
    const plan = appendFlightStep(createFlightPlan(craft, star, 0), makeNudgeStep('prograde', 0.5));
    const preview = previewFlightPlan(plan, source);
    expect(JSON.stringify(source)).toBe(before);
    expect(preview.blockedIssues).toEqual([]);
    expect(preview.outcomes).toEqual([expect.objectContaining({ result: 'applied' })]);
    expect(preview.bodies.find((body) => body.id === craft.id)?.velocity.y).toBeGreaterThan(craft.velocity.y);
  });
  it('refuses to preview structurally blocked plans', () => {
    const wrongPrimary = { ...star, id: 'other-star' };
    const plan = appendFlightStep(createFlightPlan(craft, wrongPrimary, 0), makeNudgeStep('prograde', 0.5));
    const preview = previewFlightPlan(plan, [star, wrongPrimary, craft]);
    expect(preview.blockedIssues.some((issue) => issue.code === 'NO_PRIMARY')).toBe(true);
    expect(preview.outcomes).toEqual([]);
  });

  it('renders and clears a dedicated dashed ghost trajectory', () => {
    const renderer = new TrajectoryRenderer(new ScaleTransform());
    renderer.updatePlanPreview([
      { positionKm: { x: 0, y: 0, z: 0 }, timestampSec: 0 },
      { positionKm: { x: 1000, y: 500, z: 0 }, timestampSec: 10 },
      { positionKm: { x: 2000, y: 1200, z: 0 }, timestampSec: 20 },
    ]);
    expect(renderer.getGroup().getObjectByName('FlightDirectorGhostPreview')).toBeTruthy();
    renderer.clearPlanPreview();
    expect(renderer.getGroup().getObjectByName('FlightDirectorGhostPreview')).toBeFalsy();
    renderer.dispose();
  });
});
