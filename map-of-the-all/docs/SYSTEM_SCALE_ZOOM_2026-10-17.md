# Star-system scale zoom and orbital scenery

**Project:** Map of the All, inside `westkitty/Star_System_Planner/map-of-the-all/`
**Implementation parent:** draft PR #7, commit `13419418fa3173d143f5a48c1448fc6090bf2df1`
**Scope:** real camera navigation, Three.js orbital detail, visible scale controls, acceptance coverage.

## Purpose and evidence

Existing system views showed a primary star, three editable planets and static orbit guides,
but wheel/pinch input never crossed the galaxy-to-system boundary. Close-up planet focus
required the hidden inspector and the orbit scene lacked orbital life. This uplift extends
the existing Atlas, rather than copying the separate Planner's physical n-body simulation.

The current browser checks include an actual wheel sequence, planet double-click, all
three real tiers, an accessible Enter System CTA, overview/back controls and touch-size
phone entry. The browser must report GPU draw calls >0 and no WebGL shader errors.

## Architecture contract

- `atlas-data.js` remains the only owner of saved Atlas nodes, positions, layers, routes
  and eras. The JSON v1 / localStorage key are unchanged.
- `main.js` owns semantic tier navigation, selection, inspect, Undo, and input-mode
  arbitration. Zoom events call back into `enter('system', id)` only when another editor
  is not using that input. It never mutates the Dossier or creates saved moons.
- `atlas-engine.js` retains the only animation/render loop and OrbitControls. Native
  cursor-centered zoom remains for unspecific space navigation; selecting a system or
  planet anchors wheel/pinch to that object. Inward distance crossing inside the galaxy
  triggers a narrow, reversible semantic zoom. Orbit, pan, Escape and Home remain.
- `system-zoom.js` is a pure, unit-tested guard over deliberate inward zoom, camera
  proximity, viewport framing and editor blocking. Approaching a source landmark,
  panning, or moving away cannot trigger unintended system entry.
- `system-orbit-details.js` owns bounded deterministic, display-only detail generated
  from stable system/planet IDs: up to 620 GPU-instanced asteroids, 1–2 visual moons for
  up to 10 host planets, optional comet and an occasional companion star. These bodies
  are not physical ephemerides, canonical identities, or editable Atlas nodes.
- `visual-fidelity.js` remains responsible for procedural 3D planetary materials,
  clouds and atmospheres. The parent Planner remains the only precision orbital engine.
- Renderer disposal explicitly releases `InstancedMesh` resources, geometry and
  materials on rebuilt system scenes. Animation respects existing motion-off,
  reduced-motion and quality policies.

## User paths

1. All → double-click/select a galaxy → survey system markers appear.
2. Select any system: the camera centers it and an ENTER SYSTEM control appears.
3. Scroll inward (or spread two fingers) toward the selected star. Crossing the near-camera
   threshold invokes the existing `enter('system', id)` route. Double-click or press
   ENTER SYSTEM for direct entry; keyboard Enter is also available.
4. See real star, individually editable planets, orbit trajectories, 3D moons, an
   instanced debris ring and other illustrative orbital bodies. Turn off STARS to hide
   illustrative dressings; ROUTES controls authored planet orbital guides.
5. Double-click a planet or press F while selected to focus the animated body. The camera
   tracks its transform so close inspection remains possible during orbital motion.
   Unrelated labels are suppressed during close planet inspection.
6. OVERVIEW resets to the whole orbital scene. ← GALAXY ascends one tier; Home returns
   to the All. Existing user drafts and eras remain unchanged.

## Performance and QA

The detail system's resource budgets are fixed per quality tier: battery 75,
balanced 270, cinematic 620 instanced asteroids. No external assets, new runtime
dependency, extra animation loop, new schema field, physical units, or default
postprocessing are introduced.

The local Big Mac Brave reference rendered the balanced system with 3 editable planets,
3 display-only moons, 270 instanced asteroids and a comet in **29 GPU draw calls** at
1536 × 864. This is a measured draw count, **not FPS or measured hardware thermals**.

Acceptance paths:
- `node --test map-of-the-all/tests/*.node-check.mjs`
- `npm run check`
- `node scripts/system-zoom-browser-ci.mjs` (real wheel into a second system, direct
  first-system entry, selected-planet follow, overview, ascent, phone/touch entry).
- Existing `scripts/atlas-cinematic-browser-ci.mjs` and five prior browser suites
  remain mandatory in pull-request CI.

## Verification boundaries

Physical Galaxy Tab S9 Ultra stylus/touch pinch feel, palm rejection, actual device
FPS and thermals are not established by software emulation. No factual star composition,
planet properties, physical distance, actual moon count or canonical orbital dynamics
are asserted. A draft PR or successful local test is not a Pages deployment.
