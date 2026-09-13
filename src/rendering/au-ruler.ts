/**
 * AU ruler rings (ASSET12).
 *
 * Faint gold reference circles at 1 / 2 / 5 / 10 / 20 AU around the
 * dominant star, giving tablets a persistent sense of scale that the
 * gravity grid's abstract lattice never provided.
 */

import * as THREE from 'three';
import { KM_PER_AU } from '../simulation/units';
import { disposalRegistry } from './disposal';

export const RULER_RADII_AU = [1, 2, 5, 10, 20];
const SEGMENTS = 160;

export class AuRulerRenderer {
  public readonly group = new THREE.Group();
  private rings: THREE.LineLoop[] = [];
  private centerKey = '';

  constructor() {
    this.group.name = 'au-ruler';
    this.group.visible = false;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public isVisible(): boolean {
    return this.group.visible;
  }

  /** Rebuild rings around `centerScene` (no-op when the center is unchanged). */
  public update(centerScene: THREE.Vector3, sceneUnitsPerKm: number): void {
    if (!this.group.visible) return;
    const key = `${centerScene.x.toFixed(2)},${centerScene.y.toFixed(2)},${centerScene.z.toFixed(2)}`;
    if (key === this.centerKey && this.rings.length === RULER_RADII_AU.length) {
      this.group.position.copy(centerScene);
      return;
    }
    this.centerKey = key;
    this.clearRings();
    for (const au of RULER_RADII_AU) {
      const radius = au * KM_PER_AU * sceneUnitsPerKm;
      const positions = new Float32Array(SEGMENTS * 3);
      for (let i = 0; i < SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        positions[i * 3] = Math.cos(a) * radius;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(a) * radius;
      }
      const geo = new THREE.BufferGeometry();
      disposalRegistry.track(geo, 'au-ruler-geometry');
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: au === 1 ? '#d8a93c' : '#6b5d33',
        transparent: true,
        opacity: au === 1 ? 0.55 : 0.3,
        depthWrite: false,
      });
      disposalRegistry.track(mat, 'au-ruler-material');
      const ring = new THREE.LineLoop(geo, mat);
      ring.frustumCulled = false;
      this.rings.push(ring);
      this.group.add(ring);
    }
    this.group.position.copy(centerScene);
  }

  private clearRings(): void {
    for (const ring of this.rings) {
      this.group.remove(ring);
      disposalRegistry.release(ring.geometry);
      disposalRegistry.release(ring.material as THREE.Material);
    }
    this.rings = [];
  }

  public dispose(): void {
    this.clearRings();
  }
}
