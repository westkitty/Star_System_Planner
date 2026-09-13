/**
 * Comet activity renderer (ASSET14).
 *
 * High-eccentricity bodies sprout a glowing coma and an anti-sunward ion
 * tail as they dive inside ~3.5 AU. Tail length and opacity scale with
 * 1/r² so sungrazers blaze and distant wanderers stay quiet rocks.
 */

import * as THREE from 'three';
import { KM_PER_AU } from '../simulation/units';
import { disposalRegistry } from './disposal';

export const COMET_MIN_ECCENTRICITY = 0.55;
export const COMET_ACTIVE_RADIUS_KM = 3.5 * KM_PER_AU;

interface CometVisual {
  group: THREE.Group;
  coma: THREE.Sprite;
  tail: THREE.Mesh;
}

function makeGlowTexture(inner: string, outer: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return disposalRegistry.track(tex, 'comet-texture');
}

export class CometTailRenderer {
  public readonly group = new THREE.Group();
  private visuals = new Map<string, CometVisual>();
  private glowTex: THREE.CanvasTexture | null = null;

  constructor() {
    this.group.name = 'comet-tails';
  }

  private ensureTexture(): THREE.CanvasTexture | null {
    if (!this.glowTex) {
      this.glowTex = makeGlowTexture('rgba(180,240,255,1)', 'rgba(60,140,255,0.45)');
    }
    return this.glowTex;
  }

  /**
   * Refresh comet visuals. `actives` carries bodies already filtered by
   * eccentricity + stellar proximity, with scene-space endpoints.
   */
  public update(
    actives: Array<{ id: string; headScene: THREE.Vector3; awayScene: THREE.Vector3; intensity01: number }>
  ): void {
    const live = new Set(actives.map((a) => a.id));
    for (const a of actives) {
      let vis = this.visuals.get(a.id);
      if (!vis) {
        const tex = this.ensureTexture();
        if (!tex) continue;
        const group = new THREE.Group();
        const comaMat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        disposalRegistry.track(comaMat, 'comet-material');
        const coma = new THREE.Sprite(comaMat);
        coma.scale.set(3, 3, 1);
        const tailGeo = new THREE.PlaneGeometry(1, 1);
        disposalRegistry.track(tailGeo, 'comet-geometry');
        const tailMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          color: '#7db8ff',
        });
        disposalRegistry.track(tailMat, 'comet-material');
        const tail = new THREE.Mesh(tailGeo, tailMat);
        group.add(coma);
        group.add(tail);
        vis = { group, coma, tail };
        this.visuals.set(a.id, vis);
        this.group.add(group);
      }
      vis.group.position.copy(a.headScene);
      const dir = a.awayScene.clone().sub(a.headScene);
      const len = Math.max(0.001, dir.length());
      dir.normalize();
      // Orient the tail plane along the anti-sunward axis.
      vis.tail.position.copy(dir.clone().multiplyScalar(len / 2));
      vis.tail.scale.set(Math.max(0.6, len * 0.12), len, 1);
      vis.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      (vis.coma.material as THREE.SpriteMaterial).opacity = 0.35 + a.intensity01 * 0.65;
      (vis.tail.material as THREE.MeshBasicMaterial).opacity = 0.15 + a.intensity01 * 0.6;
      const comaScale = 1.5 + a.intensity01 * 3;
      vis.coma.scale.set(comaScale, comaScale, 1);
    }
    for (const [id, vis] of [...this.visuals]) {
      if (!live.has(id)) {
        this.group.remove(vis.group);
        disposalRegistry.release(vis.coma.material as THREE.Material);
        disposalRegistry.release(vis.tail.geometry);
        disposalRegistry.release(vis.tail.material as THREE.Material);
        this.visuals.delete(id);
      }
    }
  }

  public dispose(): void {
    for (const vis of this.visuals.values()) {
      this.group.remove(vis.group);
      disposalRegistry.release(vis.coma.material as THREE.Material);
      disposalRegistry.release(vis.tail.geometry);
      disposalRegistry.release(vis.tail.material as THREE.Material);
    }
    this.visuals.clear();
    disposalRegistry.release(this.glowTex);
    this.glowTex = null;
  }
}
