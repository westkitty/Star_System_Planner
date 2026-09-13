/**
 * Procedural ring-band textures (ASSET02).
 *
 * Generates Cassini-style ring albedo strips — concentric bands with gaps,
 * noise grain, and soft edges — so ringed worlds read as structured
 * debris fields instead of flat translucent discs. Deterministic per seed.
 */

import * as THREE from 'three';
import { SeededRng } from '../core/seeded-rng';
import { disposalRegistry } from './disposal';

const cache = new Map<string, THREE.CanvasTexture>();
const MAX_CACHED = 32;

export function getRingTexture(seed: number, tintHex: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${seed}|${tintHex}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const rng = new SeededRng(seed);
  const W = 256;
  const H = 8;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const tint = new THREE.Color(tintHex);
  // 3–5 major bands separated by dark gaps (Cassini-style divisions).
  const bandCount = 3 + Math.floor(rng.nextFloat() * 3);
  const gaps: Array<{ at: number; width: number }> = [];
  for (let i = 0; i < bandCount - 1; i++) {
    gaps.push({ at: 0.2 + rng.nextFloat() * 0.6, width: 0.015 + rng.nextFloat() * 0.03 });
  }
  const img = ctx.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    let density = 0.55 + 0.45 * Math.sin(t * Math.PI); // soft radial falloff
    for (const g of gaps) {
      const d = Math.abs(t - g.at) / g.width;
      if (d < 1) density *= d * d * 0.9 + 0.05;
    }
    density *= 0.75 + rng.nextFloat() * 0.5; // grain
    const edge = Math.min(1, Math.min(t, 1 - t) * 12); // soft rims
    const alpha = Math.max(0, Math.min(1, density * edge));
    const shade = 0.65 + rng.nextFloat() * 0.5;
    for (let y = 0; y < H; y++) {
      const idx = (y * W + x) * 4;
      img.data[idx] = Math.min(255, tint.r * 255 * shade);
      img.data[idx + 1] = Math.min(255, tint.g * 255 * shade);
      img.data[idx + 2] = Math.min(255, tint.b * 255 * shade);
      img.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  disposalRegistry.track(texture, 'ring-texture');

  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) {
      disposalRegistry.release(cache.get(oldest));
      cache.delete(oldest);
    }
  }
  cache.set(key, texture);
  return texture;
}

export function clearRingTextureCache(): void {
  for (const tex of cache.values()) disposalRegistry.release(tex);
  cache.clear();
}
