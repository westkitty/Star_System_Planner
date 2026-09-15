/**
 * Body Nameplate Sprite Renderer.
 *
 * Renders crisp, always-readable name labels above each body in 3D space.
 * Labels are canvas-texture sprites sized in screen space (rescaled per frame by
 * camera distance), with type-tinted accent bars and distance-based fade so the
 * far field never becomes typographic soup.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { ScaleTransform } from './scale-transform';
import { FloatingOrigin } from './floating-origin';

const TYPE_ACCENT: Record<string, string> = {
  star: '#ffd65c',
  black_hole: '#ff4d64',
  planet: '#49e7ff',
  dwarf_planet: '#7fd4e8',
  moon: '#b0b8c4',
  station: '#ffffff',
  ship: '#a7f3d0',
  megastructure: '#d4a373',
  hookshot_node: '#d4a373',
};

export class BodyLabelRenderer {
  private group: THREE.Group;
  private scaleTransform: ScaleTransform;
  private floatingOrigin: FloatingOrigin;
  private sprites: Map<string, THREE.Sprite> = new Map();
  public enabled: boolean = false;

  constructor(scaleTransform: ScaleTransform, floatingOrigin: FloatingOrigin) {
    this.scaleTransform = scaleTransform;
    this.floatingOrigin = floatingOrigin;
    this.group = new THREE.Group();
    this.group.name = 'BodyLabelGroup';
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  private makeLabelTexture(name: string, type: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const scale = 2; // supersample for crisp text
    const font = `600 ${13 * scale}px ui-monospace, Menlo, monospace`;
    const tmp = canvas.getContext('2d')!;
    tmp.font = font;
    const textW = Math.ceil(tmp.measureText(name.toUpperCase()).width);
    const padX = 8 * scale;
    const barW = 3 * scale;
    canvas.width = textW + padX * 2 + barW + 4 * scale;
    canvas.height = 22 * scale;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(3, 8, 16, 0.72)';
    const r = 5 * scale;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(12, 198, 255, 0.28)';
    ctx.lineWidth = scale;
    ctx.stroke();

    ctx.fillStyle = TYPE_ACCENT[type] || '#49e7ff';
    ctx.fillRect(3 * scale, 4 * scale, barW, canvas.height - 8 * scale);

    ctx.font = font;
    ctx.fillStyle = '#e2e8f0';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), barW + 8 * scale, canvas.height / 2 + scale * 0.5);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Sync labels to bodies; call once per frame (cheap: map lookups + rescale). */
  public update(bodies: CelestialBody[], camera: THREE.Camera, maxVisibleDistance: number): void {
    const alive = new Set(bodies.map(b => b.id));

    for (const [id, sprite] of this.sprites) {
      if (!alive.has(id)) {
        this.group.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.sprites.delete(id);
      }
    }

    if (!this.enabled) {
      for (const [, sprite] of this.sprites) sprite.visible = false;
      return;
    }

    for (const body of bodies) {
      let sprite = this.sprites.get(body.id);
      if (!sprite) {
        const tex = this.makeLabelTexture(body.name, body.type);
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          sizeAttenuation: false,
        });
        sprite = new THREE.Sprite(mat);
        sprite.name = `label-${body.id}`;
        const aspect = tex.image.width / tex.image.height;
        sprite.scale.set(0.035 * aspect, 0.035, 1);
        this.group.add(sprite);
        this.sprites.set(body.id, sprite);
      }

      const rel = this.floatingOrigin.toRelative(body.position);
      const disp = this.scaleTransform.getDisplayPosition(rel);
      const dispRadius = this.scaleTransform.getDisplayRadius(body.radiusKm, body.type);
      sprite.position.set(disp.x, disp.y + dispRadius * 1.35 + 1.2, disp.z);

      // Distance fade: hide far-field labels entirely to avoid clutter
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      const dist = camPos.distanceTo(sprite.position);
      sprite.visible = dist < maxVisibleDistance;
      const fade = Math.max(0.15, 1 - dist / maxVisibleDistance);
      (sprite.material as THREE.SpriteMaterial).opacity = fade;
    }
  }

  public dispose(): void {
    for (const [, sprite] of this.sprites) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this.group.remove(sprite);
    }
    this.sprites.clear();
  }
}
