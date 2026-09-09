/**
 * Blank System Preset.
 */

import { CelestialBody } from '../types';

export function createBlankSystem(): { bodies: CelestialBody[] } {
  return {
    bodies: [],
  };
}
