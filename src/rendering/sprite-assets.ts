/**
 * Procedural additive-sprite asset foundry.
 *
 * Canvas-baked radial sprites (no binary assets):
 * - ASSET03 atmospheric fresnel-glow shells for enveloped worlds,
 * - ASSET04 stellar corona flares with slow pulse animation,
 * - ASSET13 deep-field nebula veils for parallax backdrop depth.
 */

import * as THREE from 'three';

function bakeRadialSprite(stops: Array<[number, string]>, size = 256): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) grad.addColorStop(offset, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

const coronaCache = new Map<string, THREE.CanvasTexture>();
const atmosphereCache = new Map<string, THREE.CanvasTexture>();

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** ASSET04 — stellar corona sprite sized in display units. */
export function createCoronaSprite(starColor: string, coronaColor: string, displayRadius: number): THREE.Sprite | null {
  const key = `${starColor}|${coronaColor}`;
  let texture = coronaCache.get(key);
  if (!texture) {
    const baked = bakeRadialSprite([
      [0, hexToRgba('#ffffff', 0.95)],
      [0.18, hexToRgba(starColor, 0.85)],
      [0.42, hexToRgba(coronaColor, 0.35)],
      [0.7, hexToRgba(coronaColor, 0.1)],
      [1, hexToRgba(coronaColor, 0)],
    ]);
    if (!baked) return null;
    texture = baked;
    coronaCache.set(key, texture);
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const size = displayRadius * 7;
  sprite.scale.set(size, size, 1);
  sprite.name = 'corona';
  return sprite;
}

/** ASSET03 — atmospheric rim-glow shell hugging the planet limb. */
export function createAtmosphereShell(atmosphereColor: string, displayRadius: number): THREE.Mesh | null {
  const key = atmosphereColor;
  let texture = atmosphereCache.get(key);
  if (!texture) {
    const baked = bakeRadialSprite([
      [0.62, hexToRgba(atmosphereColor, 0)],
      [0.78, hexToRgba(atmosphereColor, 0.55)],
      [0.92, hexToRgba(atmosphereColor, 0.28)],
      [1, hexToRgba(atmosphereColor, 0)],
    ]);
    if (!baked) return null;
    texture = baked;
    atmosphereCache.set(key, texture);
  }
  const geometry = new THREE.SphereGeometry(1.22, 32, 24);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(atmosphereColor),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  // Note: BackSide shell reads as a limb halo without occluding the surface.
  void texture;
  const shell = new THREE.Mesh(geometry, material);
  shell.scale.set(displayRadius, displayRadius, displayRadius);
  shell.name = 'atmosphere';
  return shell;
}

/** ASSET13 — deep-field nebula veils placed far behind the system. */
export function createNebulaVeils(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NebulaVeils';
  const veils: Array<{ color: string; position: [number, number, number]; size: number; opacity: number }> = [
    { color: '#0a3a5c', position: [-14000, 3000, -18000], size: 22000, opacity: 0.5 },
    { color: '#3c0a2e', position: [12000, -4000, -20000], size: 26000, opacity: 0.4 },
    { color: '#0a2a44', position: [2000, 9000, -22000], size: 18000, opacity: 0.45 },
  ];
  for (const veil of veils) {
    const texture = bakeRadialSprite([
      [0, hexToRgba(veil.color, veil.opacity)],
      [0.5, hexToRgba(veil.color, veil.opacity * 0.5)],
      [1, hexToRgba(veil.color, 0)],
    ], 128);
    if (!texture) continue;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.8,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...veil.position);
    sprite.scale.set(veil.size, veil.size * 0.7, 1);
    group.add(sprite);
  }
  return group;
}

export function disposeSpriteCaches(): void {
  for (const t of coronaCache.values()) t.dispose();
  for (const t of atmosphereCache.values()) t.dispose();
  coronaCache.clear();
  atmosphereCache.clear();
}
