/**
 * Live Motion Trail Renderer.
 *
 * Draws the recent observed path of each body (the past), complementing the
 * worker-computed future trajectories. Trails sample at a fixed cadence so slow
 * time rates draw tight loops and high time rates draw long historic sweeps.
 */

import * as THREE from 'three';
import { CelestialBody, Vector3D } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

interface TrailBuffer {
  points: Vector3D[]; // absolute km
  lastSampleSimSec: number;
}

const SAMPLE_INTERVAL_SIM_SEC = 900; // 15 sim-minutes between trail samples

export class TrailRenderer {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;
  private trails: Map<string, TrailBuffer> = new Map();
  private lines: Map<string, { line: THREE.Line; positions: Float32Array; colors: Float32Array }> = new Map();
  private maxPoints: number;
  public enabled: boolean = false;

  constructor(scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin, maxPoints: number = 220) {
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;
    this.maxPoints = Math.max(32, maxPoints);
    this.group = new THREE.Group();
    this.group.name = 'TrailRendererGroup';
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public setMaxPoints(n: number): void {
    this.maxPoints = Math.max(32, Math.round(n));
    for (const [, tr] of this.trails) {
      if (tr.points.length > this.maxPoints) {
        tr.points.splice(0, tr.points.length - this.maxPoints);
      }
    }
  }

  /** Sample current body positions and redraw polylines. */
  public update(bodies: CelestialBody[], simTimeSec: number): void {
    const alive = new Set(bodies.map(b => b.id));

    // Prune trails/lines for destroyed bodies
    for (const id of Array.from(this.trails.keys())) {
      if (!alive.has(id)) this.removeBody(id);
    }

    if (!this.enabled) {
      for (const [, entry] of this.lines) entry.line.visible = false;
      return;
    }

    for (const body of bodies) {
      let trail = this.trails.get(body.id);
      if (!trail) {
        trail = { points: [], lastSampleSimSec: -Infinity };
        this.trails.set(body.id, trail);
      }

      if (simTimeSec - trail.lastSampleSimSec >= SAMPLE_INTERVAL_SIM_SEC || trail.points.length === 0) {
        trail.points.push({ ...body.position });
        trail.lastSampleSimSec = simTimeSec;
        if (trail.points.length > this.maxPoints) {
          trail.points.splice(0, trail.points.length - this.maxPoints);
        }
      }

      this.redraw(body, trail);
    }
  }

  private redraw(body: CelestialBody, trail: TrailBuffer): void {
    let entry = this.lines.get(body.id);
    if (!entry) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(this.maxPoints * 3);
      const colors = new Float32Array(this.maxPoints * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.group.add(line);
      entry = { line, positions, colors };
      this.lines.set(body.id, entry);
    }

    const { line, positions, colors } = entry;
    line.visible = trail.points.length > 1;

    const base = new THREE.Color(body.color || '#8fa6c0');
    const n = trail.points.length;
    const capacity = positions.length / 3;
    const start = Math.max(0, n - capacity);

    for (let i = start; i < n; i++) {
      const idx = i - start;
      const rel = this.floatingOrigin.toRelative(trail.points[i]);
      const disp = this.scaleTransform.getDisplayPosition(rel);
      positions[idx * 3] = disp.x;
      positions[idx * 3 + 1] = disp.y;
      positions[idx * 3 + 2] = disp.z;

      // Fade older samples toward void
      const t = (idx + 1) / (n - start);
      const fade = t * 0.55;
      colors[idx * 3] = base.r * fade;
      colors[idx * 3 + 1] = base.g * fade;
      colors[idx * 3 + 2] = base.b * fade;
    }

    line.geometry.setDrawRange(0, n - start);
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.attributes.color.needsUpdate = true;
  }

  private removeBody(id: string): void {
    this.trails.delete(id);
    const entry = this.lines.get(id);
    if (entry) {
      this.group.remove(entry.line);
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      this.lines.delete(id);
    }
  }

  public clearAll(): void {
    for (const id of Array.from(this.trails.keys())) this.removeBody(id);
  }

  public dispose(): void {
    this.clearAll();
  }
}
