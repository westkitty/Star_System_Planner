# Phase 6 — Temporal Cartography and Public Preview Release

## Scope and authority

The Map of the All has three **independent editorial surveys** corresponding to the *Blood Eclipse War*, *Siege Wall locking*, and *Post-Siege survey* categories already offered by the original prototype. These are categorical lenses, **not dated measurements**. The source establishes a 170-year war and documented events, but no exact position/velocity history for the galaxies, star systems, boundaries, or routes displayed here.

Current editor and WorldsVault identity links remain read-only. Every named or unnamed star placement, edit, region, corridor and epoch variation in this module remains provisional. Changing any one slot never changes authoritative canon.

## User workflow

1. Open the atlas via `/Star_System_Planner/map-of-the-all/` on the published Planner site.
2. Edit any active era's galaxies, systems, planets, routes, region shapes or layer visibility using the existing cartographic controls.
3. Choose a new era using the footer's three buttons, the **EDIT / COMPARE** control, or its discrete range scrubber. The previous era saves automatically; the new era restores its own geometry.
4. Open **EDIT / COMPARE**, select a baseline era, inspect new/missing/edited objects, routes, regions, layer toggles and schematic screen-projected movement trails. There is no interpolation into non-authored dates.
5. Optionally add an editorial note (max 800 characters) to an era. The note is not a source citation or canon lock.
6. Optionally choose **REPLACE BASELINE WITH CURRENT DRAFT**, acknowledge the destructive-to-that-draft confirmation, and Undo if needed. No copy happens without that action.
7. Export the JSON to retain all three snapshots in one artifact. Old version-1 single-era JSON imports still work and are expanded into three independent copies.

## Architecture decisions

- The outer `version:1` file format, storage key, existing 3D camera, original planner entry and simulator physics remain unchanged. An *optional* `timeline: {version:1, snapshots: {war, locking, post}, notes: {...}}` carries three individual draft snapshots. Each contains `{nodes, routes, regions, layers}`.
- All other atlas preferences (`motion`, quality, typography scale) stay global; editable content and visibility/layer toggles are era-specific. Active top-level nodes/routes/regions/layers mirror the chosen era, preserving compatibility with Phase 2 through Phase 5 components.
- Each normal draft edit synchronizes its active timeline copy and is validated, creating one existing Undo entry. Switching eras or explicitly cloning a draft is a single Undo-able transaction. No second animation loop is created; SVG deltas are updated when the existing camera controls move.
- The Atlas validator is reused for each stored snapshot to guard schema limits, parent hierarchies, corridor endpoints, region geometry, labels, coordinate finiteness and source links. Invalid or incoherent imported timelines are rejected; no silent overwrite of another era occurs.
- On JSON import, source-status claims are demoted in **all** snapshots, not just the current one. Original live Dossier topology remains separate and read-only.
- No inferred mathematical star trajectories, synthetic war-year positions, linear timeline animation, official sovereignty, metric galaxy distances, or travel durations.
- The browser timeline and diff UI use semantic DOM controls, accessible labels and a pointer-inert SVG projected through the existing Three.js camera. Reduced-motion support follows user settings.

## Comparative scout and decision

- [`vis-timeline`](https://github.com/visjs/vis-timeline) treats temporal items and editable positions as separable records, useful as a user-workflow analogy but unnecessary as an added runtime dependency for only three categorical slices.
- [OpenHistoricalMap map-styles](https://github.com/OpenHistoricalMap/map-styles) separates temporal map display concerns from underlying geography/data. Applying continuous historical year interpolation would imply date precision absent from our Starsilk source.
- **Decision:** discrete copy-on-write snapshots with explicit provenance and a reversible compare mode. Avoid a 170-step interpolation or auto-assignment of world positions to plot years without source evidence.

## Acceptance gates

- Legacy JSON version 1 unchanged/accepted; optional timeline does not alter original storage key.
- Three eras can be independently edited and revisited without cross-era overwrites; old and new maps safely reimport.
- Source identity and source URL demotion happens across every imported snapshot.
- Structural limits remain enforced on the full nested timeline; malformed, invalid or incoherent era snapshots are rejected before persistence.
- Difference reporting is deterministic and side-effect free. The overlay follows the original camera; no duplicate WebGL loop or hotlinked assets.
- The existing network routing, region editing, spatial gestures, schema tests, original planner controls and Pages-compatible multi-entry build continue passing.
- The `main` deployment workflow must build/test the original Planner, run all Atlas model and UI gates, deploy the `dist` artifact and verify the published root and Atlas HTML over HTTPS.
- Physical Samsung Tab S9 Ultra / S Pen latency, thermals and memory remain explicitly unverified until observed on hardware.

## Release fence

Committing and pushing the feature branch is distinct from merging and publishing. `main` must only be merged after the feature workflow passes and the full PR diff is inspected. The existing repository Pages deployment is `actions/deploy-pages` from the `main` build artifact; post-deploy URL checks must confirm it is actually reachable.
