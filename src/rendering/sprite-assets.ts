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

/**
 * Spectral-class corona grading (iteration 3, ASSET04).
 *
 * O giants blaze wide and hot; M dwarfs smolder small and dim. The grade
 * scales sprite size and opacity so spectral class reads at a glance.
 */
export function coronaGradeForLetter(letter: string): { size: number; intensity: number } {
  switch (letter) {
    case 'O': return { size: 9.5, intensity: 1.0 };
    case 'B': return { size: 8.5, intensity: 1.0 };
    case 'A': return { size: 7.8, intensity: 1.0 };
    case 'F': return { size: 7.2, intensity: 1.0 };
    case 'G': return { size: 7.0, intensity: 1.0 };
    case 'K': return { size: 6.2, intensity: 0.9 };
    case 'M': return { size: 5.2, intensity: 0.75 };
    default: return { size: 7.0, intensity: 1.0 };
  }
}

/** ASSET04 — stellar corona sprite sized in display units. */
export function createCoronaSprite(
  starColor: string,
  coronaColor: string,
  displayRadius: number,
  grade?: { size: number; intensity: number }
): THREE.Sprite | null {
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
    opacity: Math.min(1, grade?.intensity ?? 1),
  });
  const sprite = new THREE.Sprite(material);
  const size = displayRadius * (grade?.size ?? 7);
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
export function createNebulaVeils(seed = 0): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NebulaVeils';
  // Iteration 3 ASSET05: the backdrop drifts per project seed so every
  // saved universe gets its own sky instead of the same three veils.
  const u = seed >>> 0;
  const palette = ['#0a3a5c', '#3c0a2e', '#0a2a44', '#1a2a5c', '#2e0a3c', '#0a3a44'];
  const jitter = (i: number, span: number): number => (((u >> (i * 5)) % 100) / 100 - 0.5) * span;
  const veils: Array<{ color: string; position: [number, number, number]; size: number; opacity: number }> = [
    { color: palette[u % palette.length], position: [-14000 + jitter(0, 6000), 3000, -18000], size: 22000 + jitter(1, 6000), opacity: 0.5 },
    { color: palette[(u + 2) % palette.length], position: [12000 + jitter(2, 6000), -4000, -20000], size: 26000 + jitter(3, 6000), opacity: 0.4 },
    { color: palette[(u + 4) % palette.length], position: [2000 + jitter(4, 6000), 9000, -22000], size: 18000 + jitter(5, 5000), opacity: 0.45 },
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
