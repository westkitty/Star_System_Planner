# Phase 4 — Strategic Atlas (draft cartography)

## Scope and non-goals

- Primary artifact: existing `westkitty/Star_System_Planner` feature branch, `map-of-the-all/` only.
- Continue the 3D Atlas; preserve the original physics simulator, source topology, canon Dossier and 11 phase-one visual layers.
- New **Strategic Studio** side inspector: bounded multi-selection, shift-selection and marquee, rigid group translations using one projected centroid handle, discrete accessible arrow/Y nudges, region polygons with direct vertex drag and numeric vertex editing, and 4X-style survey reports of internal/frontier corridors.
- Provisional **display units** are never light years, AU, or politically recognized boundaries. Affiliation is user-authored editorial text, not a known faction assertion. No canonical territory, battle outcome, ownership, travel time or distance is inferred.
- There is **no additional Three.js render loop**. AtlasEngine owns WebGL; StrategicStudio only adds disposable region presentation objects to its existing scene group and uses transient DOM/SVG gesture previews.

## State and safety architecture

1. Region data is optional `state.regions` on the existing v1 draft JSON. Old imports without that array still load; no destructive schema migration or LocalStorage key change.
2. Each region has a draft status, display color, editable name, untrusted affiliation note, galaxy-or-root parent, and 3–24 finite `[x,z]` vertices bounded to ±10,000 display units. Self-intersecting or degenerate polygons are rejected before `change()` can save them.
3. Up to 48 regions and 32 selected nodes. Group translation validates same-tier same-parent draft objects; source/reference identities are always excluded. Translational clipping preserves relative positions rather than distorting the selected constellation at a boundary.
4. `change()` remains the sole undo/autosave owner. Drag and marquee previews do not mutate persistent draft state. One release causes a single undoable mutation. Escape/pointercancel discard active work. Invalid editing actions leave source untouched.
5. Region surfaces are rendered as lightweight Three.js ShapeGeometry with transparent color and lines. On scene rebuild or view changes region meshes are released; per-frame label/selection effects do not allocate geometry. A `territories=false` layer switch hides all region mesh geometry; data remains available for later re-enable.
6. Local-only editor, no telemetry, no uploads, no new runtime package/dependency. Orbit and Phase 3 tools disengage Strategic Studio on mode switch.

## Operation

From the Atlas top bar choose **STRATEGY LAB ✥**. Use **GROUP** mode for marker selection and rigid transforms. Shift-click in the navigator to add/remove markers, drag a screen marquee, or **ALL VISIBLE**. Drag the projected group handle, or use directional/height nudge buttons. Undo one change with Ctrl/Cmd+Z.

Choose **CREATE SURVEY BOUNDARY FROM SELECTION** to produce a padded provisional polygon. Alternatively use **REGIONS → DRAW POLYGON**, tap 3–24 positions in the current cosmic or galaxy view, then FINISH. Region vertices can be dragged as independent screen handles, edited as numerical X/Z display coordinates, added or removed, recolored, and renamed. Read the panel's member count and internal/frontier route count to assess topology *as a visualization, not as physical access or sovereignty*. Switch **ORBIT** to rotate without editing.

## Comparative recon (bounded scout)

- Three.js DragControls/TransformControls publish object-level transformations and drag lifecycles; group transforms need an explicit group/centroid abstraction. We adopt a **single group translation transaction** rather than moving model nodes individually per frame. <https://threejs.org/docs/pages/DragControls.html>
- Terra Draw / MapLibre's polygon editor separates **draw**, **select** and **edit** modes and intentionally excludes edit handles from persisted geometry. We use those interaction boundaries, but not MapLibre's terrestrial coordinate system or a new dependency. <https://maplibre.org/maplibre-gl-js/docs/examples/draw-geometries-with-terra-draw/>
- Mapbox GL Draw similarly separates draw/create/update/delete and shows why source geometry must have bounded validated vertices. We adopt polygon validity tests rather than importing GIS claims into an unmeasured cosmos. <https://github.com/mapbox/mapbox-gl-draw/blob/main/docs/API.md>

## Acceptance gates

- Node model/schema regressions prove backward compatibility, hull construction, finite valid polygon topology, anti-authority constraints, parent-deletion cascade and rigid group moves.
- Parent 200+ tests, TypeScript, Vite multi-entry production build and total gzip budget remain passing.
- Real Chromium test demonstrates selection, group nudge & Undo, drag handle, region creation, metrics, edit, source dialog and parent navigation. Mobile-emulated layout additionally checks tap targets and horizontal overflow. Physical Tab S9 stylus pressure/latency, thermals and long-session FPS remain **unknown** until verified on device.
- `main` and canonical Dossier remain untouched; CI screenshot evidence is a temporary artifact (not an approved canonical image).
