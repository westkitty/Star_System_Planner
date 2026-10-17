# THE MAP OF THE ALL — Starsilk Atlas Laboratory (Prototype 0.1)

A Three.js, 4X-inspired, source-aware **editable cosmological survey** in the `Star_System_Planner` ecosystem.

**Status:** interactive design prototype. Every generated galaxy name, coordinate, boundary, hookshot route, planet, stellar orbit, and territorial relationship is **provisional**. Worldsvault/Drakken/Mother source references are identity/topology references, never source-authored geographic positions.

## Access

### From the existing repository (preferred)

```bash
# Run from the Star_System_Planner repository root after obtaining this branch.
npm ci
npm run dev
# Visit http://localhost:5173/Star_System_Planner/map-of-the-all/
```

The root Vite configuration includes an additional HTML entry, preserving the current Star System Planner at its original root URL. For publication through the existing GitHub Pages workflow, the atlas path is `https://westkitty.github.io/Star_System_Planner/map-of-the-all/` **only after a successful deployment**.

### As a standalone source kit

```bash
cd map-of-the-all
npm install
npm run dev
# Visit the localhost URL Vite prints.
```

Running `index.html` via `file://` is unsupported; Vite resolves the local `three` package imports.

## Interactions

- Drag / pointer orbit, wheel or pinch zoom, two-finger pan, hover-free selection, double-click to dive; 3D hit testing and clickable DOM-projected labels.
- All → galaxy → stellar system → labelled planets and editable annotations. Breadcrumbs, Home/Escape, search, focus, top-down and reset cameras.
- Eleven independently switchable layers: galactic structure, stellar detail, Hookshot corridors, azure Starsilk filaments, territory overlays, the Siege Wall absence, Blood Rings, WorldsVault references, annotations, typography and coordinate guides.
- Three temporal lenses: Blood Eclipse War, Siege Wall locking, post-Siege. **Visual filters only**, not computed historical census or epoch-specific correct positions.
- Inspect and edit provisional object names, descriptive annotations, X/Y/Z *display* coordinates, colors, size, label colors, typeface and font size.
- Create galaxies, systems, planets, and annotations. Select CONNECT ROUTE then select another object on the same tier to make a corridor; change corridor type between provisional Hookshot and azure via `H`/`S` and remove with `×` in the route list.
- Auto-save to browser-local `localStorage`; JSON export/import, bounded schema validation, 30-step Undo (`Ctrl/Cmd+Z`). Import demotes incoming canon claims, rather than granting source authority.
- Tablet-aware layout, optional cinematic quality, reduced-motion respect, capped DPR, bounded star particle counts, one render loop, DOM label reuse and GPU resource disposal during view changes.

## Preservation and integration

This is intentionally a **second isolated Vite page**, not a refactor of the mature per-system simulator. Avoid copying the existing planner's physics engine into the cosmological rendering scale. The integration seam is the named child system: future deep dives may use a stable export/bridge into the mature `Star_System_Planner` system simulator instead of re-implementing n-body mechanics.

`map-of-the-all/atlas-data.js` owns draft state + validation; `atlas-engine.js` owns Three.js WebGL scene, controls, level-of-detail, picking and animation; `main.js` owns semantic DOM + editing + persistence; `atlas.css` owns presentation. All objects are in display coordinates, not light years/AU or actual physical measurements. No root Dossier writes and no canon approval paths exist.

## Source hierarchy

1. `westkitty/Starsilk_Character_Dossier/src/content/` and `src/canon/invariants.json` own lore.
2. The published `/worldsvault/worldsvault.json` contains direct-authored topological relationships, without authored numeric coordinates.
3. Planner read-only snapshot + display models can cite that source, not override it.
4. Five user-supplied images establish distinct **visual presentation variants**, not a guaranteed final official map.
5. This prototype's generated graph is explicitly a draft and may not be promoted to canon by edit, import, or export.

See `docs/CANON_AND_IMAGE_AUDIT.md` and `docs/COMPARATIVE_RECON.md`.

## Checks

```bash
node --test tests/atlas-data.node-check.mjs
node --check atlas-data.js
node --check atlas-engine.js
node --check main.js
# From the parent repository root after adding this branch:
npm run typecheck && npm run test && npm run build && npm run bundle:report
```

The Node checks prove the data model, editor markup and source integrity boundaries. Desktop Brave automation has exercised WebGL startup, layer toggles, full three-tier navigation, edits, persistence, export and the parent route. Tablet (1280×800) and phone (412×915) touch emulation have also passed. Physical Galaxy Tab S9/S Pen behavior, GPU frame rates, long sessions and GitHub Pages deployment remain unverified. See [QA evidence](docs/QA_EVIDENCE.md). The temporal lens remains editorial rather than a historical simulator.


## Phase 2: source topology and orbital laboratory

The header's **SOURCE GRAPH** opens an offline, read-only relationship projection of the Dossier's 11 WorldsVault identity nodes and 6 direct-authored relations, pinned to Dossier blob `862bc476fb8165784704151eed35c915cbf31bf4`. It is a conceptual graph without coordinates or route metrics, and its evidence links open the Dossier.

Select a **draft stellar system** (or enter it), then choose **EXPORT SYSTEM .SSP** and **OPEN PLANNER**. Use the planner's existing **IMPORT** control to load the downloaded `.ssp.json`. The bridge generates explicitly hypothetical physical initial conditions with source status `unknown`; no atlas display distances become physical measurements, and no project is auto-imported or overwritten.

See [Phase 2 design and risk boundary](docs/PHASE2_SOURCE_GRAPH_AND_HANDOFF.md). The Atlas Node tests run with `node --test map-of-the-all/tests/*.node-check.mjs` from the repository root; the existing Vitest suite also contains an actual planner-importer compatibility test. The dedicated GitHub workflow verifies both test suites and the parent build on feature-branch pushes and PRs.

## Future expansion roadmap

1. Canon read-only sync with stable entities/edges and explicit missing-coordinate records, version/hash conflict indicator, topology versus metric view.
2. Import/export world schema bridge to Star System Planner's mature gravity/orbit simulator, with no duplicate physics ownership.
3. Per-system data-driven Starsilk macros, Drakken containment and Blood Rings, tied only to source-confirmed eras and loci.
4. Tablet S Pen drag/reposition gizmos, undoable gestures, multi-select and lasso, resizable labels with collision editing.
5. Lazy-loaded star catalog chunks, instancing/impostors, camera-relative render frame, worker generation, adaptive quality/FPS overlay.
6. 4X survey infrastructure: exploration visibility, noncanonical named factions, causal event atlas, logistics routes and timeline forks as user-authored proposals.
7. Source-ledger and contradiction review UI with explicit canon-promotion approval outside the editor.

This is a prototype, not an asserted complete cosmos.
