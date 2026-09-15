/**
 * System Sigil Generator.
 *
 * Generates a deterministic, planner-authored visual fingerprint for any system
 * state. The sigil is genuinely derived from the architecture it represents:
 *
 * - Host star spectral class selects the core flame palette.
 * - Surviving body count determines barcode filament density.
 * - Total angular momentum magnitude tilts and stretches the orbital arcs.
 * - A collapsed-singularity state burns the field crimson.
 *
 * Identical macrostate -> identical sigil, always. Note: this is an interface
 * artifact and does NOT exist in Starsilk canon.
 */

import { CelestialBody } from '../simulation/types';
import { calculateTotalAngularMomentum } from '../simulation/orbital-mechanics';
import { spectralClassFromTempK } from '../simulation/units';

const SPECTRAL_CORE: Record<string, string> = {
  O: '#9db4ff',
  B: '#aabfff',
  A: '#f8f7ff',
  F: '#fcf1d0',
  G: '#ffd65c',
  K: '#ffb14e',
  M: '#ff6d4d',
  VOID: '#ff4d64',
};

export interface SigilInputs {
  angularMomentumMagnitude: number;
}

export function generateSystemSigilSvg(
  projectName: string,
  bodies: CelestialBody[],
  seed: number = 42,
  inputs?: SigilInputs
): string {
  // --- Derive the physical signature of the system ---
  const star = bodies.find(b => b.type === 'star') || bodies.find(b => b.type === 'black_hole');
  const bodyCount = bodies.length;
  const angMom = inputs?.angularMomentumMagnitude ?? magnitude(calculateTotalAngularMomentum(bodies));
  const logL = Math.log10(Math.max(1, angMom)); // ~1e38-1e42 typical
  // A star is "destroyed" when absent from the census, extinguished
  // (zero luminosity), or frozen dark (zero effective temperature).
  const starAlive = star !== undefined && (star.luminosityW ?? 1) > 0 && (star.temperatureK ?? 1) > 0;
  const destroyed = bodies.length > 0 && !starAlive;

  const spectral = destroyed
    ? 'VOID'
    : star
      ? star.type === 'black_hole'
        ? 'VOID'
        : spectralClassFromTempK(star.temperatureK ?? 5778)
      : 'G';
  const coreColor = SPECTRAL_CORE[spectral] ?? '#ffd65c';

  // --- Deterministic hash seeded by name, body census, spectral code, and L ---
  let hash = seed;
  for (let i = 0; i < projectName.length; i++) {
    hash = (hash * 31 + projectName.charCodeAt(i)) >>> 0;
  }
  hash = (hash * 17 + bodyCount * 7919) >>> 0;
  hash = (hash * 13 + spectral.charCodeAt(0)) >>> 0;
  hash = (hash * 7 + Math.round(logL * 100)) >>> 0;
  if (destroyed) hash = (hash * 3 + 0xA8018) >>> 0; // extinction scars the geometry

  function nextFloat(): number {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return (hash >>> 8) / 16777216;
  }

  const arcCount = 3 + Math.min(4, Math.max(0, Math.floor((logL - 36) / 2))); // 3..7 by L
  const barcodeCount = 6 + Math.min(12, bodyCount * 2); // density = census

  let arcsSvg = '';
  for (let i = 0; i < arcCount; i++) {
    const rx = 24 + i * 7;
    // Angular momentum flattens and tilts the geometry
    const ry = Math.max(6, (12 + i * 4) * (1.25 - Math.min(0.5, (logL - 37) * 0.05)));
    const rot = -20 + nextFloat() * 10 - Math.min(15, (logL - 37) * 2);
    const strokeWidth = 1.0 + (i % 2 === 0 ? 0.5 : 0);
    const strokeColor = destroyed ? '#ff4d64' : i % 2 === 0 ? '#0cc6ff' : '#49e7ff';
    const dash = i % 3 === 0 ? 'stroke-dasharray="3 5"' : '';
    arcsSvg += `<ellipse cx="64" cy="64" rx="${rx}" ry="${ry.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="0.6" ${dash} transform="rotate(${rot.toFixed(1)} 64 64)" />`;
  }

  let barcodeSvg = '';
  const barStartX = 34;
  for (let i = 0; i < barcodeCount; i++) {
    const bx = barStartX + i * 4.5;
    const bh = 20 + nextFloat() * 30;
    const by = 64 - bh / 2;
    const w = nextFloat() > 0.6 ? 2.5 : 1.2;
    const barColor = nextFloat() > 0.4 ? '#0cc6ff' : '#b6f6ff';
    barcodeSvg += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" fill="${barColor}" fill-opacity="0.85" />`;
  }

  const fieldColor = destroyed ? '#1a0208' : '#07131e';
  const rimColor = destroyed ? '#880010' : '#0cc6ff';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect width="128" height="128" fill="#03050a" rx="16" stroke="${rimColor}" stroke-opacity="0.5" stroke-width="1.5" />
    <circle cx="64" cy="64" r="50" fill="${fieldColor}" fill-opacity="0.4" />
    ${arcsSvg}
    <circle cx="64" cy="64" r="18" fill="#03050a" stroke="${coreColor}" stroke-width="1.5" />
    <g transform="rotate(-15 64 64)">
      ${barcodeSvg}
    </g>
    <circle cx="64" cy="64" r="2" fill="${coreColor}" />
  </svg>`;
}

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
