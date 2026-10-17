# Phase 3 — Spatial Studio contract

Scope: `feature/map-of-the-all-prototype`, only `map-of-the-all/` plus existing branch-specific browser QA script.

## Ownership

- `atlas-data.js`: authoritative **draft** content and schema v1. `label.offset` is optional, normalized viewport fractions (backwards-compatible). Existing saves without offsets remain valid. Offsets have explicit finite limits.
- `atlas-engine.js`: original Three.js loop and disposal remain untouched. Exposes camera, controls, hit-targets, projected labels to the editor as read-only render data.
- `spatial-studio.js`: one pointer-interaction adapter (Move, Route, Label), a read-only projection of selected render targets; does not create a second render loop or mutate scene objects each pointermove.
- `studio-math.js`: pure projection-independent coordinate, snap, route admissibility and label-offset validation. All edits commit once through `main.js` change/Undo guard. No physical unit conversion.
- `main.js`: only owner of authoritative draft mutations, undo, persistence, view, and mode routing.
- `studio.css`: optional visual lenses and input affordances, presentation-only; none of the lenses modify canonical facts or save schema.

## Acceptance criteria

1. Studio panel switches Orbit / Move / Route / Label; mobile buttons >= 40 CSS px.
2. Selected editable draft node can be moved in XZ or Y using pointer capture. Drag is preview-only; release creates one undo snapshot, cancel creates none. On-device multigesture arbitration must not make unwanted edits.
3. Move cannot change source-reference landmarks. Snap options work in *cartographic display* units, never AU or canonical distances.
4. Route tool creates one provisional route only after selecting two compatible draft objects of same tier and parent; duplicates/self/concept links refused. Undo removes it.
5. Label tool can drag editable labels. Offsets are normalized by viewport dimensions, survive export/reload, and old v1 saves without offsets still validate. Text zoom slider updates the existing typographyScale.
6. Lenses: Survey (neutral), Signal (luminous), Cartographer (desaturated blueprint). Purely visual and reversible.
7. Parent PWA and mature orbital engine unchanged; no canonical Dossier write.
8. Node, schema, parent CI and headed/headless browser gesture tests before declaring complete. Physical Galaxy Tab S9 Ultra S Pen / thermals require a separate target-device proof.

## Non-goals

- No canon promotion, physical orbital simulation, multi-object formation dragging, source-coordinate import, WebGPU migration, or claim of physical-device testing.
