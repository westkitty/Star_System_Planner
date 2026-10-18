# Cinematic Survey Visual Pass — 2026-10-17

**Target:** `westkitty/Star_System_Planner/map-of-the-all/` only.
**Basis:** `main` commit `e7930c71e74389a0ebd84c80ae4a807fc6f62c42`.
**Candidate:** `uplift/atlas-cinematic-render-polish-20261017`; this record does **not** assert deployment.

## Art direction

Obsidian void, restrained azure Starsilk, atmospheric but legible spiral-galaxy cartography. The
Map remains a navigable Three.js environment with real 3D planets, luminous navigational
filaments, independently animated stellar points, and in-world draft markers. Unauthored map
positions remain illustrative. The Siege Wall exterior remains intentionally starless; no
abstract fog or nebula has been placed beyond it. No licensed third-party art, postprocessor,
new runtime dependency, canonical coordinate claim, or separate animation loop is introduced.

## Implemented renderer and interface changes

- Galaxy planes: upgraded procedural fragment shader (multi-octave cloud structure,
  rotating filaments, dust attenuation, colored galactic cores). GPU shader time advances
  only with existing motion enabled and respects system reduced-motion preference.
- Background: shared rounded-point shader stars rather than visibly square point sprites,
  fixed-seed placement, starless Siege Wall boundary protected.
- Planetary tier: procedural deterministic 3D surface maps, gas strata or rocky detail,
  optional cloud shells with independent rotation, Fresnel atmosphere geometry and improved
  stellar corona. **These are fictional visual studies, not canon physical attributes.**
- Navigation: camera-facing selection geometry, perceptible primary labels, safe focus-ring
  states and accessible 44 px minimum navigation tabs. Portrait camera field of view and
  home position offer a more readable map than naïve desktop framing.
- Filaments: halo/core twin tube layering and one-batch GPU spark positions (rather than
  separate animated sprite draw calls).
- Rendering lifecycle: shared glow textures per build, unique GPU disposal, one combined
  survey grid geometry, throttled DOM label updates, existing render-loop ownership intact.
- Retained quality presets: cinematic uses denser stars, higher-res terrain and clouds;
  balanced uses moderate detail; battery keeps simpler geometries with no cloud/atmosphere
  shells and fewer sparks. User preference persists through existing Atlas schema.
- No changes to `starsilk.map-of-the-all.draft.v1`, JSON v1 imports, three independent
  editor eras, parent orbital physics, or Dossier canon boundaries.

## Verification and limits

Existing all-phase Chromium acceptance remains in place. New
`scripts/atlas-cinematic-browser-ci.mjs` additionally checks live rendered WebGL draw
calls, visible projected labels, object selection, All → galaxy → system navigation,
both nondefault historical eras, reduced-motion phone navigation, battery quality,
no horizontal overflow, no page errors or GPU shader errors, and the independent root
Planner URL. Screenshot artifact paths are `atlas-qa-evidence/cinematic-*.png`.

Local Big Mac Brave (SwiftShader software GPU) reference before the later starfield/camera
refinement: All 125 → 92 draw calls and galaxy 130 → 25 immediately after sprite batching;
the final dual-core filament version recorded All **97** and galaxy **102** at 1536×864,
and system **25 → 12** draw calls when switching to battery quality. The current phone
overview draws more visible objects than the prior cropped framing, so raw mobile draw-call
counts should **not** be interpreted as a speedup. Counts reflect specific screenshots
and scene content, **not FPS**, thermal behavior, or hardware GPU comparisons.

Mandatory final evidence before merge: fresh Atlas Node tests, root Planner Vitest and
TypeScript, Vite multi-page bundle/PWA budget, Chromium all-phase acceptance on the exact
candidate commit, diff and protected-repo review. A live Pages verification of both Atlas
and Planner is still required *after* any authorized production merge.

**Unverified:** physical Galaxy Tab S9 Ultra S Pen hover/palm behavior and frame pacing,
sustained mobile GPU thermal/performance, aesthetic user approval and any deployment until
the relevant workflow reports success. Source-linked identities remain read-only and source
versus draft markers are unchanged.
