/**
 * Syzygy, conjunction, and resonance discovery (GAME02–GAME04).
 *
 * Pure geometric detectors over live body states:
 * - eclipses (a world enters another's shadow) and transits (a small body
 *   crosses the stellar disc as seen from a third world),
 * - close-approach conjunctions between any pair,
 * - mean-motion resonances (2:1, 3:2, …) among co-primary orbiters.
 *
 * The event monitor throttles these into ledger entries; the scene renders
 * shadow cones for fresh syzygies.
 */

import { CelestialBody, Vector3D } from './types';
import { KM_PER_AU } from './units';
import { calculateOsculatingElements, findDominantPrimary } from './orbital-mechanics';
import { SpatialHash } from './spatial-hash';

export interface SyzygyEvent {
  kind: 'eclipse' | 'transit';
  viewerId: string;
  occluderId: string;
  starId: string;
  /** 0..1 occultation depth estimate. */
  magnitude01: number;
}

export interface ConjunctionEvent {
  bodyAId: string;
  bodyBId: string;
  separationKm: number;
}

export interface ResonanceFinding {
  bodyAId: string;
  bodyBId: string;
  primaryId: string;
  ratioLabel: string;
  detunePct: number;
}

function sub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(v: Vector3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Perpendicular distance from point P to the ray Origin→Dir (dir normalized). */
function rayDistance(origin: Vector3D, dirN: Vector3D, p: Vector3D): number {
  const w = sub(p, origin);
  const t = dot(w, dirN);
  if (t <= 0) return Number.POSITIVE_INFINITY;
  const cx = origin.x + dirN.x * t;
  const cy = origin.y + dirN.y * t;
  const cz = origin.z + dirN.z * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

function normalized(v: Vector3D): Vector3D {
  const m = magnitude(v) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

export function detectSyzygies(bodies: CelestialBody[]): SyzygyEvent[] {
  const out: SyzygyEvent[] = [];
  const stars = bodies.filter((b) => b.type === 'star');
  const worlds = bodies.filter((b) => b.type !== 'star' && b.type !== 'black_hole');
  for (const star of stars) {
    for (const occluder of worlds) {
      for (const viewer of worlds) {
        if (occluder.id === viewer.id) continue;
        // Eclipse: occluder sits between the star and the viewer.
        const starToViewer = sub(viewer.position, star.position);
        const distStarViewer = magnitude(starToViewer);
        const starToOccluder = sub(occluder.position, star.position);
        const distStarOccluder = magnitude(starToOccluder);
        if (distStarOccluder < distStarViewer && distStarViewer > 0) {
          const miss = rayDistance(star.position, normalized(starToViewer), occluder.position);
          if (miss < occluder.radiusKm * 1.1) {
            const distOccViewer = magnitude(sub(viewer.position, occluder.position)) || 1;
            const angOcc = occluder.radiusKm / distOccViewer;
            const angStar = star.radiusKm / distStarViewer;
            out.push({
              kind: 'eclipse',
              viewerId: viewer.id,
              occluderId: occluder.id,
              starId: star.id,
              magnitude01: Math.min(1, angStar > 0 ? angOcc / angStar : 1),
            });
          }
        }
        // Transit: small occluder crosses the stellar disc as seen by the viewer.
        if (occluder.radiusKm < star.radiusKm * 0.25 && occluder.type !== 'star') {
          const viewerToStar = sub(star.position, viewer.position);
          const distViewerStar = magnitude(viewerToStar);
          const viewerToOcc = sub(occluder.position, viewer.position);
          const distViewerOcc = magnitude(viewerToOcc);
          if (distViewerOcc < distViewerStar && distViewerStar > 0) {
            const miss = rayDistance(viewer.position, normalized(viewerToStar), occluder.position);
            if (miss < star.radiusKm) {
              out.push({
                kind: 'transit',
                viewerId: viewer.id,
                occluderId: occluder.id,
                starId: star.id,
                magnitude01: Math.max(0, 1 - miss / star.radiusKm),
              });
            }
          }
        }
      }
    }
  }
  return out;
}

export const DEFAULT_CONJUNCTION_KM = 0.05 * KM_PER_AU;

export function detectConjunctions(
  bodies: CelestialBody[],
  thresholdKm = DEFAULT_CONJUNCTION_KM,
  hash?: SpatialHash
): ConjunctionEvent[] {
  const out: ConjunctionEvent[] = [];
  const seen = new Set<string>();
  const byId = new Map(bodies.map((b) => [b.id, b]));
  if (hash) {
    hash.clear();
    for (const b of bodies) hash.insert(b.id, b.position);
    for (const b of bodies) {
      for (const otherId of hash.queryRadius(b.position, thresholdKm, b.id)) {
        const key = [b.id, otherId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const other = byId.get(otherId);
        if (!other) continue;
        out.push({
          bodyAId: b.id,
          bodyBId: otherId,
          separationKm: magnitude(sub(b.position, other.position)),
        });
      }
    }
    return out;
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = magnitude(sub(bodies[i].position, bodies[j].position));
      if (sep <= thresholdKm) {
        out.push({ bodyAId: bodies[i].id, bodyBId: bodies[j].id, separationKm: sep });
      }
    }
  }
  return out;
}

const RESONANCE_PAIRS: Array<[number, number]> = [
  [2, 1],
  [3, 1],
  [3, 2],
  [4, 1],
  [4, 3],
  [5, 2],
  [5, 3],
];

export function detectResonances(bodies: CelestialBody[], tolerance = 0.015): ResonanceFinding[] {
  const out: ResonanceFinding[] = [];
  const orbiters = bodies.filter((b) => b.type !== 'star' && b.type !== 'black_hole' && !b.fixed);
  const primaries = new Map<string, CelestialBody | null>();
  const periodOf = new Map<string, number>();
  for (const b of orbiters) {
    const primary = b.primaryId
      ? (bodies.find((x) => x.id === b.primaryId) ?? findDominantPrimary(b, bodies))
      : findDominantPrimary(b, bodies);
    primaries.set(b.id, primary);
    if (!primary) continue;
    const el = calculateOsculatingElements(b, primary);
    if (el && el.isBound && el.periodSec > 0) periodOf.set(b.id, el.periodSec);
  }
  for (let i = 0; i < orbiters.length; i++) {
    for (let j = i + 1; j < orbiters.length; j++) {
      const a = orbiters[i];
      const c = orbiters[j];
      const pa = primaries.get(a.id);
      const pc = primaries.get(c.id);
      if (!pa || !pc || pa.id !== pc.id) continue;
      const ta = periodOf.get(a.id);
      const tc = periodOf.get(c.id);
      if (!ta || !tc) continue;
      const ratio = Math.max(ta, tc) / Math.min(ta, tc);
      for (const [p, q] of RESONANCE_PAIRS) {
        const target = p / q;
        const detune = Math.abs(ratio - target) / target;
        if (detune <= tolerance) {
          out.push({
            bodyAId: a.id,
            bodyBId: c.id,
            primaryId: pa.id,
            ratioLabel: `${p}:${q}`,
            detunePct: detune * 100,
          });
          break;
        }
      }
    }
  }
  return out;
}
