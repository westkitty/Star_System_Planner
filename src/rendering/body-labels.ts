/**
 * Floating body name labels (ASSET11).
 *
 * Canvas-sprite nameplates that track bodies in 3D, fade with distance,
 * and highlight the selection. A bounded texture cache (one per unique
 * name) keeps label churn allocation-free.
 */

import * as THREE from 'three';
import { CelestialBody } from '../simulation/types';
import { disposalRegistry } from './disposal';

const textureCache = new Map<string, THREE.CanvasTexture>();
const MAX_LABEL_TEXTURES = 128;

function labelTexture(text: string, accent: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${accent}|${text}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const font = '600 28px system-ui, -apple-system, sans-serif';
  const measurer = document.createElement('canvas').getContext('2d');
  if (!measurer) return null;
  measurer.font = font;
  const w = Math.ceil(measurer.measureText(text).width) + 28;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 44;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = accent;
  ctx.fillText(text, 14, 23);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  disposalRegistry.track(texture, 'body-label');
  if (textureCache.size >= MAX_LABEL_TEXTURES) {
    const oldest = textureCache.keys().next().value as string | undefined;
    if (oldest) {
      disposalRegistry.release(textureCache.get(oldest));
      textureCache.delete(oldest);
    }
  }
  textureCache.set(key, texture);
  return texture;
}

/**
 * Per-type label accents (iteration 3, ASSET06).
 *
 * Stars burn gold, singularities violet, stations cyan — the nameplate
 * color now answers "what is that?" before the architect even selects it.
 */
export function labelAccentForBody(b: CelestialBody, selectedBodyId: string | null): string {
  if (b.id === selectedBodyId) return '#ffd166';
  switch (b.type) {
    case 'star': return '#ffdd66';
    case 'black_hole': return '#c084fc';
    case 'planet': return '#b8c7d9';
    case 'dwarf_planet': return '#9fb0c3';
    case 'moon': return '#8d99a8';
    case 'station': return '#7df9ff';
    case 'ship': return '#5eead4';
    case 'megastructure': return '#f0abfc';
    default: return '#b8c7d9';
  }
}

export class BodyLabelRenderer {
  public readonly group = new THREE.Group();
  private sprites = new Map<string, THREE.Sprite>();

  constructor() {
    this.group.name = 'body-labels';
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Reposition labels; called every frame (cheap: no allocation when the
   * census is stable). `toScene` maps sim-km to scene units.
   */
  public update(
    bodies: CelestialBody[],
    toScene: (p: { x: number; y: number; z: number }, out: THREE.Vector3) => THREE.Vector3,
    camera: THREE.Camera,
    selectedBodyId: string | null,
    liftSceneUnits = 2.2
  ): void {
    if (!this.group.visible) return;
    const live = new Set<string>();
    const scratch = new THREE.Vector3();
    for (const b of bodies) {
      live.add(b.id);
      let sprite = this.sprites.get(b.id);
      const accent = labelAccentForBody(b, selectedBodyId);
      if (!sprite) {
        const tex = labelTexture(b.name, accent);
        if (!tex) continue;
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        disposalRegistry.track(mat, 'body-label-material');
        sprite = new THREE.Sprite(mat);
        sprite.name = `label-${b.id}`;
        sprite.renderOrder = 50;
        this.sprites.set(b.id, sprite);
        this.group.add(sprite);
      }
      // Refresh texture when selection accent changes.
      const mat = sprite.material as THREE.SpriteMaterial;
      const want = labelTexture(b.name, accent);
      if (want && mat.map !== want) {
        mat.map = want;
        mat.needsUpdate = true;
      }
      toScene(b.position, scratch);
      sprite.position.set(scratch.x, scratch.y + liftSceneUnits, scratch.z);
      const dist = camera.position.distanceTo(sprite.position);
      const scale = Math.max(4, Math.min(14, dist * 0.045));
      sprite.scale.set(scale * 2.4, scale * 0.6, 1);
      mat.opacity = dist > 4000 ? 0 : b.id === selectedBodyId ? 1 : 0.85;
    }
    for (const [id, sprite] of [...this.sprites]) {
      if (!live.has(id)) {
        this.group.remove(sprite);
        disposalRegistry.release(sprite.material as THREE.Material);
        this.sprites.delete(id);
      }
    }
  }

  public dispose(): void {
    for (const sprite of this.sprites.values()) {
      this.group.remove(sprite);
      disposalRegistry.release(sprite.material as THREE.Material);
    }
    this.sprites.clear();
  }
}

export function clearLabelTextureCache(): void {
  for (const tex of textureCache.values()) disposalRegistry.release(tex);
  textureCache.clear();
}
