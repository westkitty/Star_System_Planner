/**
 * Procedural planet-surface texture foundry (ASSET02).
 *
 * Canvas-generated equirectangular albedo textures per planetary
 * classification (rocky, desert, oceanic, ice, gas giant, scorched,
 * remnant, artificial). Deterministic per (classification, seed), cached,
 * and requiring zero network or binary assets.
 */

import * as THREE from 'three';
import { PlanetClassification } from '../simulation/types';
import { SeededRng } from '../core/seeded-rng';
import { disposalRegistry } from './disposal';

const TEXTURE_SIZE = 256;
// BACK15: bounded LRU so infinite body churn cannot pin GPU memory.
const MAX_CACHED_TEXTURES = 96;
const cache = new Map<string, THREE.CanvasTexture>();

function basePalette(classification: PlanetClassification): [string, string, string] {
  switch (classification) {
    case 'rocky': return ['#6b6257', '#8a7f70', '#4a443c'];
    case 'desert': return ['#c98f4e', '#e0b070', '#8a5a28'];
    case 'oceanic': return ['#123f6e', '#2f7fd0', '#3fa34d'];
    case 'ice': return ['#dfeeF7', '#bfe6f5', '#7fb6cc'];
    case 'gas_giant': return ['#d8a05a', '#efe0b8', '#a06a35'];
    case 'scorched': return ['#5a2318', '#d46534', '#2a0f0a'];
    case 'remnant': return ['#4b5563', '#6b7280', '#1f2937'];
    case 'artificial': return ['#334155', '#64748b', '#0f172a'];
    default: return ['#5b6b7c', '#8a9bb0', '#2e3a47'];
  }
}

function paintTexture(
  ctx: CanvasRenderingContext2D,
  classification: PlanetClassification,
  rng: SeededRng
): void {
  const [deep, mid, accent] = basePalette(classification);
  const S = TEXTURE_SIZE;

  // Vertical gradient base.
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, mid);
  grad.addColorStop(0.5, deep);
  grad.addColorStop(1, mid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  if (classification === 'gas_giant') {
    // Horizontal banding with sinusoidal wobble.
    const bands = 9;
    for (let b = 0; b < bands; b++) {
      const y0 = (b / bands) * S;
      ctx.fillStyle = b % 2 === 0 ? mid : accent;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= S; x += 8) {
        ctx.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 4 + b * 1.7) * 5);
      }
      for (let x = S; x >= 0; x -= 8) {
        ctx.lineTo(x, y0 + S / bands + Math.sin((x / S) * Math.PI * 4 + b * 1.7) * 5);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Great storm oval.
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(S * 0.68, S * 0.62, S * 0.09, S * 0.055, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (classification === 'oceanic') {
    // Continents: clustered blobs above the ocean base.
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, S, S);
    for (let c = 0; c < 7; c++) {
      const cx = rng.range(0, S);
      const cy = rng.range(S * 0.15, S * 0.85);
      for (let b = 0; b < 26; b++) {
        ctx.fillStyle = rng.nextFloat() < 0.7 ? accent : mid;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(cx + rng.range(-34, 34), cy + rng.range(-20, 20), rng.range(4, 16), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Polar caps.
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#f4fbff';
    ctx.fillRect(0, 0, S, 14);
    ctx.fillRect(0, S - 14, S, 14);
    ctx.globalAlpha = 1;
    return;
  }

  if (classification === 'ice') {
    // Fractured shelf lines.
    ctx.strokeStyle = 'rgba(90, 140, 170, 0.5)';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = rng.range(0.6, 2);
      ctx.beginPath();
      const x0 = rng.range(0, S);
      const y0 = rng.range(0, S);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + rng.range(-60, 60), y0 + rng.range(-30, 30));
      ctx.stroke();
    }
    return;
  }

  if (classification === 'scorched') {
    // Lava cracks glowing through basalt.
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = mid;
    ctx.shadowColor = '#ff9a3c';
    ctx.shadowBlur = 8;
    for (let i = 0; i < 26; i++) {
      ctx.lineWidth = rng.range(1, 3);
      ctx.beginPath();
      let x = rng.range(0, S);
      let y = rng.range(0, S);
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += rng.range(-40, 40);
        y += rng.range(-24, 24);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    return;
  }

  // Rocky / desert / remnant / artificial: craters + noise speckle.
  const craters = classification === 'rocky' || classification === 'remnant' ? 46 : 18;
  for (let i = 0; i < craters; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(2, classification === 'desert' ? 9 : 14);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  }
  if (classification === 'artificial') {
    // City-grid light lattice.
    ctx.strokeStyle = 'rgba(73, 231, 255, 0.35)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < S; gx += 16) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, S);
      ctx.stroke();
    }
    for (let gy = 0; gy < S; gy += 16) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(S, gy);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rng.nextFloat() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)';
      ctx.fillRect(rng.range(0, S), rng.range(0, S), 1.5, 1.5);
    }
  }
}

/** Fetch (or generate + cache) the albedo texture for a classification. */
export function getPlanetTexture(classification: PlanetClassification, seed: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${classification}:${seed}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    paintTexture(ctx, classification, new SeededRng(SeededRng.hashString(key) ^ (seed >>> 0)));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    disposalRegistry.track(texture, 'planet-texture');
    if (cache.size >= MAX_CACHED_TEXTURES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest) {
        disposalRegistry.release(cache.get(oldest));
        cache.delete(oldest);
      }
    }
    cache.set(key, texture);
    return texture;
  } catch {
    return null;
  }
}

/** Release all cached textures (quality reset / dispose). */
export function disposePlanetTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
