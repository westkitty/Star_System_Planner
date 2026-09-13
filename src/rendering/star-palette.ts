/**
 * Stellar spectral-class palette (ASSET01).
 *
 * Morgan–Keenan O/B/A/F/G/K/M classes with representative colors,
 * temperatures, and mass/radius/luminosity anchors. Used by the star
 * shader tint, procedural generator, body creator, and navigator badges
 * so every star in the planner carries honest astrophysical character.
 */

export type SpectralLetter = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface SpectralClass {
  class: SpectralLetter;
  label: string;
  color: string;
  coronaColor: string;
  temperatureK: number;
  massSolar: number;
  radiusSolar: number;
  luminositySolar: number;
}

export const SPECTRAL_CLASSES: SpectralClass[] = [
  { class: 'O', label: 'O — Blue Supergiant', color: '#9db8ff', coronaColor: '#cfe0ff', temperatureK: 40000, massSolar: 32, radiusSolar: 12, luminositySolar: 250000 },
  { class: 'B', label: 'B — Blue-White', color: '#b6caff', coronaColor: '#dceaff', temperatureK: 20000, massSolar: 8, radiusSolar: 5, luminositySolar: 3000 },
  { class: 'A', label: 'A — White', color: '#e8f1ff', coronaColor: '#ffffff', temperatureK: 8500, massSolar: 2.1, radiusSolar: 1.9, luminositySolar: 25 },
  { class: 'F', label: 'F — Yellow-White', color: '#fff3d6', coronaColor: '#fffbe8', temperatureK: 6500, massSolar: 1.35, radiusSolar: 1.3, luminositySolar: 4.5 },
  { class: 'G', label: 'G — Yellow Dwarf', color: '#ffdd66', coronaColor: '#ffeeaa', temperatureK: 5700, massSolar: 1.0, radiusSolar: 1.0, luminositySolar: 1.0 },
  { class: 'K', label: 'K — Orange Dwarf', color: '#ffb35c', coronaColor: '#ffd9a0', temperatureK: 4500, massSolar: 0.7, radiusSolar: 0.75, luminositySolar: 0.3 },
  { class: 'M', label: 'M — Red Dwarf', color: '#ff7a4d', coronaColor: '#ffab85', temperatureK: 3200, massSolar: 0.35, radiusSolar: 0.4, luminositySolar: 0.04 },
];

export function spectralClassForMass(massKg: number): SpectralClass {
  const solar = massKg / 1.98847e30;
  if (solar >= 16) return SPECTRAL_CLASSES[0];
  if (solar >= 4) return SPECTRAL_CLASSES[1];
  if (solar >= 1.7) return SPECTRAL_CLASSES[2];
  if (solar >= 1.15) return SPECTRAL_CLASSES[3];
  if (solar >= 0.85) return SPECTRAL_CLASSES[4];
  if (solar >= 0.55) return SPECTRAL_CLASSES[5];
  return SPECTRAL_CLASSES[6];
}

export function spectralClassByLetter(letter: SpectralLetter): SpectralClass {
  return SPECTRAL_CLASSES.find((c) => c.class === letter) ?? SPECTRAL_CLASSES[4];
}
