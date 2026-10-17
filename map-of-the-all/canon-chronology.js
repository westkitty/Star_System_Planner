/**
 * Read-only historical anchors transcribed from the authoritative Character Dossier.
 * These are NOT timestamps for Atlas geometry, and do not assign historical positions.
 * Source authority lives in the Dossier; these display facts are derivatives only.
 */
export const BLOOD_ECLIPSE_CANON = Object.freeze({
  durationYears: 170,
  sourceLinks: Object.freeze({
    narrative: 'https://github.com/westkitty/Starsilk_Character_Dossier/blob/main/src/content/sections/chronology.body.html',
    invariants: 'https://github.com/westkitty/Starsilk_Character_Dossier/blob/main/src/canon/invariants.json',
    events: 'https://github.com/westkitty/Starsilk_Character_Dossier/blob/main/src/chronology/events.json',
  }),
  documentedMarkers: Object.freeze([
    Object.freeze({ marker: 'Year 0', startYear: 0, endYear: 0, event: 'Fringe-colony hostilities and first Administration counter-macros' }),
    Object.freeze({ marker: 'Year 3', startYear: 3, endYear: 3, event: 'First Blood Rings erected at Fallenstar Prime' }),
    Object.freeze({ marker: 'Years 7–120', startYear: 7, endYear: 120, event: 'Long attrition and countless fallen worlds' }),
    Object.freeze({ marker: 'Year 121', startYear: 121, endYear: 121, event: 'Siege of the Ruby Eclipse at the Pharos Nebula' }),
    Object.freeze({ marker: 'Year 170', startYear: 170, endYear: 170, event: 'Aureal Gate collapse and first Drakken use of Starsilk against divine authority' }),
  ]),
  // Order is canon; the Dossier does NOT date each downstream action separately.
  finalCausalSequence: Object.freeze([
    Object.freeze({ id: 'aureal-gate-starsilk', label: 'Drakken weaponize Starsilk', authoredMarker: 'Year 170' }),
    Object.freeze({ id: 'halven-heliocide', label: 'Tiger orders sequential star collapses', authoredMarker: null }),
    Object.freeze({ id: 'siege-wall-formation', label: 'The collapsed stars form the nascent containment lattice', authoredMarker: null }),
    Object.freeze({ id: 'siege-wall-locking', label: 'The permanent quarantine is locked in the post-war era', authoredMarker: 'Post-War Era' }),
  ]),
  unspecified: Object.freeze([
    'Absolute calendar dates',
    'Historical coordinates, trajectories and distances',
    'Exact separate date for the heliocide',
    'Exact separate date for formation and locking of the Siege Wall',
  ]),
});
