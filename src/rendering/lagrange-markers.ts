/**
 * Lagrange-point marker constellation (ASSET12).
 *
 * Five labeled diamond buoys (L1–L5) for the selected secondary–primary
 * pair, recomputed live from the orbital-mechanics solver. Turns an
 * invisible dynamical feature into a tangible navigation aid.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { computeLagrangePoints } from '../simulation/orbital-mechanics';

const POINT_NAMES = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;

export class LagrangeMarkerGroup {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private markers: THREE.Mesh[] = [];
  private labelSprites: THREE.Sprite[] = [];

  constructor(scaleTransform: ScaleTransform) {
    this.scaleTransform = scaleTransform;
    this.group = new THREE.Group();
    this.group.name = 'LagrangeMarkers';
    this.group.visible = false;

    const markerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#d4a373'),
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    // Iteration 3 ASSET13: the stable trojan camps glow gold; the
    // unstable collinear points keep surveyor's tan.
    const trojanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd166'),
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const trojan = i >= 3;
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(trojan ? 1.9 : 1.6), trojan ? trojanMat : markerMat);
      marker.name = `lagrange-${POINT_NAMES[i]}`;
      this.group.add(marker);
      this.markers.push(marker);
      const label = this.makeLabel(POINT_NAMES[i], trojan ? '#ffd166' : '#f5d9a8');
      this.group.add(label);
      this.labelSprites.push(label);
    }
  }

  private makeLabel(text: string, fill = '#f5d9a8'): THREE.Sprite {
    let texture: THREE.CanvasTexture | null = null;
    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = 'bold 30px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = fill;
          ctx.fillText(text, 48, 24);
          texture = new THREE.CanvasTexture(canvas);
        }
      }
    } catch {
      texture = null;
    }
    const material = new THREE.SpriteMaterial({
      map: texture ?? undefined,
      color: texture ? '#ffffff' : '#f5d9a8',
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(10, 5, 1);
    return sprite;
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  /** Refresh markers for the selected body against its primary. */
  public update(selected: CelestialBody | null, allBodies: CelestialBody[]): void {
    if (!selected || selected.type === 'star' || selected.type === 'black_hole') {
      this.group.visible = false;
      return;
    }
    const primary =
      allBodies.find((b) => b.id === selected.primaryId) ??
      allBodies.find((b) => b.type === 'star') ??
      null;
    if (!primary || primary.id === selected.id) {
      this.group.visible = false;
      return;
    }
    const points = computeLagrangePoints(primary, selected);
    if (!points) {
      this.group.visible = false;
      return;
    }
    const list = [points.L1, points.L2, points.L3, points.L4, points.L5];
    for (let i = 0; i < 5; i++) {
      const disp = this.scaleTransform.getDisplayPosition(list[i]);
      this.markers[i].position.set(disp.x, disp.y, disp.z);
      this.labelSprites[i].position.set(disp.x, disp.y + 4, disp.z);
    }
    this.group.visible = true;
  }

  public dispose(): void {
    for (const marker of this.markers) marker.geometry.dispose();
    for (const label of this.labelSprites) {
      (label.material as THREE.SpriteMaterial).map?.dispose();
      (label.material as THREE.Material).dispose();
    }
  }
}
