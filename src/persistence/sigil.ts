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
import { SeededRng } from '../core/seeded-rng';
import { spectralClassForMass } from '../rendering/star-palette';

export function generateSystemSigilSvg(
  projectName: string,
  bodies: CelestialBody[],
  seed: number = 42
): string {
  // ASSET15: sigil v2 — deterministic, but now data-legible:
  // spectral core, per-body orbit ticks, habitability arc, ring count.
  const rng = new SeededRng(
    (SeededRng.hashString(projectName) ^ (seed >>> 0) ^ (bodies.length * 2654435761)) >>> 0
  );

  const stars = bodies.filter((b) => b.type === 'star');
  const planets = bodies.filter((b) => b.type === 'planet' || b.type === 'dwarf_planet');
  const moons = bodies.filter((b) => b.type === 'moon');
  const collapsed = bodies.some((b) => b.type === 'black_hole' || b.isCollapsedSingularity);
  const primary = stars[0] ?? bodies[0];
  const spectral = primary ? spectralClassForMass(primary.massKg) : null;
  const coreColor = collapsed ? '#a855f7' : spectral?.color ?? '#0cc6ff';
  const ringTotal = bodies.reduce((n, b) => n + (b.rings?.length ?? 0), 0);
  const temperate = bodies.filter((b) => {
    const t = b.temperatureK ?? 0;
    return (b.type === 'planet' || b.type === 'moon') && t >= 200 && t <= 320;
  }).length;

  // Concentric orbit arcs: one per planet+moon, capped for legibility.
  const orbiters = Math.min(8, planets.length + moons.length);
  let arcsSvg = '';
  for (let i = 0; i < Math.max(2, orbiters); i++) {
    const rx = 26 + i * 6.2;
    const ry = 13 + i * 3.1;
    const rot = -20 + rng.range(-6, 6);
    const strokeColor = i % 2 === 0 ? '#0cc6ff' : '#49e7ff';
    const dash = i % 3 === 0 ? 'stroke-dasharray="3 5"' : '';
    arcsSvg += `<ellipse cx="64" cy="64" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${i % 2 === 0 ? 1.5 : 1}" stroke-opacity="0.6" ${dash} transform="rotate(${rot.toFixed(1)} 64 64)" />`;
  }

  // Body-count tick ring around the rim.
  let ticksSvg = '';
  const tickCount = Math.min(48, Math.max(4, bodies.length * 2));
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * Math.PI * 2;
    const lit = i < bodies.length * 2;
    const x1 = 64 + Math.cos(angle) * 56;
    const y1 = 64 + Math.sin(angle) * 56;
    const x2 = 64 + Math.cos(angle) * (lit ? 60 : 58);
    const y2 = 64 + Math.sin(angle) * (lit ? 60 : 58);
    ticksSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${lit ? '#0cc6ff' : '#1e3a5f'}" stroke-width="${lit ? 1.6 : 1}" />`;
  }

  // Barcode core.
  let barcodeSvg = '';
  const barcodeCount = 8 + rng.intRange(0, 7);
  for (let i = 0; i < barcodeCount; i++) {
    const bx = 34 + i * 4.5;
    const bh = 20 + rng.range(0, 30);
    const by = 64 - bh / 2;
    const w = rng.nextFloat() > 0.6 ? 2.5 : 1.2;
    const barColor = rng.nextFloat() > 0.4 ? '#0cc6ff' : '#b6f6ff';
    barcodeSvg += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" fill="${barColor}" fill-opacity="0.85" />`;
  }

  // Habitability arc (emerald) + ring-count diamonds (amber).
  const hzArc =
    temperate > 0
      ? `<path d="M 20 92 A 52 52 0 0 0 108 92" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-opacity="0.9" />`
      : '';
  let ringGlyphs = '';
  for (let i = 0; i < Math.min(4, ringTotal); i++) {
    const gx = 52 + i * 8;
    ringGlyphs += `<rect x="${gx}" y="8" width="5" height="5" fill="#d4a373" transform="rotate(45 ${gx + 2.5} 10.5)" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="System sigil for ${projectName.replace(/"/g, '')}">
    <rect width="128" height="128" fill="#03050a" rx="16" stroke="#0a2a44" stroke-width="1.5" />
    <circle cx="64" cy="64" r="50" fill="#07131e" fill-opacity="0.4" />
    ${ticksSvg}
    ${arcsSvg}
    ${hzArc}
    <circle cx="64" cy="64" r="18" fill="#03050a" stroke="${coreColor}" stroke-width="2" />
    <g transform="rotate(-15 64 64)">
      ${barcodeSvg}
    </g>
    <circle cx="64" cy="64" r="2.4" fill="${coreColor}" />
    ${ringGlyphs}
  </svg>`;
}
