/**
 * System Sigil Generator.
 * 
 * Generates a deterministic, planner-authored visual fingerprint for any system or branch.
 * Visual language: Black field, ordered barcode geometry, orbital concentric arcs,
 * sparse azure (#0CC6FF) and cyan (#B6F6FF) linework.
 * 
 * Note: This is an interface artifact and does NOT exist in Starsilk canon.
 */

import { CelestialBody } from '../simulation/types';

export function generateSystemSigilSvg(
  projectName: string,
  bodies: CelestialBody[],
  seed: number = 42
): string {
  // Deterministic hash based on name, seed, and body masses
  let hash = seed;
  for (let i = 0; i < projectName.length; i++) {
    hash = (hash * 31 + projectName.charCodeAt(i)) >>> 0;
  }
  for (const b of bodies) {
    hash = (hash * 17 + Math.round(b.radiusKm)) >>> 0;
  }

  function nextFloat(): number {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return (hash >>> 8) / 16777216;
  }

  const arcCount = 3 + (hash % 4); // 3 to 6 arcs
  const barcodeCount = 8 + (hash % 8); // 8 to 15 barcode bars

  let arcsSvg = '';
  for (let i = 0; i < arcCount; i++) {
    const rx = 24 + i * 8;
    const ry = 12 + i * 4;
    const rot = -20 + nextFloat() * 10;
    const strokeWidth = 1.0 + (i % 2 === 0 ? 0.5 : 0);
    const strokeColor = i % 2 === 0 ? '#0cc6ff' : '#49e7ff';
    const dash = i % 3 === 0 ? 'stroke-dasharray="3 5"' : '';
    arcsSvg += `<ellipse cx="64" cy="64" rx="${rx}" ry="${ry}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="0.6" ${dash} transform="rotate(${rot.toFixed(1)} 64 64)" />`;
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
    <rect width="128" height="128" fill="#03050a" rx="16" stroke="#0a2a44" stroke-width="1.5" />
    <circle cx="64" cy="64" r="50" fill="#07131e" fill-opacity="0.4" />
    ${arcsSvg}
    <circle cx="64" cy="64" r="18" fill="#03050a" stroke="#0cc6ff" stroke-width="1.5" />
    <g transform="rotate(-15 64 64)">
      ${barcodeSvg}
    </g>
    <circle cx="64" cy="64" r="2" fill="#ffffff" />
  </svg>`;
}
