/**
 * Collision / Roche Debris Particle Renderer.
 *
 * Draws the engine's transient debris cloud as a single THREE.Points draw call
 * with per-particle color and lifetime fade. Previously debris particles were
 * physically simulated but never visible; this renderer closes that loop.
 */

import * as THREE from 'three';
import { CollisionDebrisParticle } from '../simulation/collisions';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

const MAX_DEBRIS_POINTS = 600;

export class DebrisRenderer {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin) {
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;

    this.positions = new Float32Array(MAX_DEBRIS_POINTS * 3);
    this.colors = new Float32Array(MAX_DEBRIS_POINTS * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public getObject(): THREE.Points {
    return this.points;
  }

  /** Render-pass sync from the engine's live debris list. */
  public update(debris: CollisionDebrisParticle[]): void {
    const count = Math.min(debris.length, MAX_DEBRIS_POINTS);
    this.points.visible = count > 0;

    for (let i = 0; i < count; i++) {
      const d = debris[i];
      const rel = this.floatingOrigin.toRelative(d.position);
      const disp = this.scaleTransform.getDisplayPosition(rel);
      this.positions[i * 3] = disp.x;
      this.positions[i * 3 + 1] = disp.y;
      this.positions[i * 3 + 2] = disp.z;

      const lifeFraction = Math.max(0, Math.min(1, d.lifetimeRemainingSec / Math.max(0.001, d.initialLifetimeSec)));
      const c = new THREE.Color(d.color || '#ff8844');
      const brightness = 0.25 + lifeFraction * 0.95;
      this.colors[i * 3] = c.r * brightness;
      this.colors[i * 3 + 1] = c.g * brightness;
      this.colors[i * 3 + 2] = c.b * brightness;
    }

    this.geometry.setDrawRange(0, count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
