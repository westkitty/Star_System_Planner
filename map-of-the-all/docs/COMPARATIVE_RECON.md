# Comparative project reconnaissance — source-grounded, 2026-10-17

## Decision

Should the Map of the All be an extension of the current, feature-rich System Planner, a standalone Three.js universe generator, or a nested **atlas front-end** that can hand off into the existing per-system simulator?

**Verdict:** Atlas frontend on an isolated Vite page, with stable system IDs and future optional handoff into the mature simulator. The cosmic survey and 1:1 orbital solver have different precision, streaming and source-authority requirements.

## Internal repository comparisons (live GitHub inspection)

| Project | What exists | Reuse | Boundary |
| --- | --- | --- | --- |
| `westkitty/Star_System_Planner` | React/Three Vite PWA; orbit controls, floating origin, deterministic seed, hierarchical System Navigator, per-system editor, local persistence + branch ledger, canon manifest | Parent repository, build/deploy, visual language and future deep-dive integration | Do not rewrite its verified system simulation or pretend it scales automatically to galaxies. |
| `westkitty/Starsilk_PWA_Mapper` | Rich rendering: custom starfields and atmospherics, smart collision-avoided DOM body labels, perf/memory governors, pointer/pen interactions | DOM labels and collision detection ideas, consistent pickable targets, LOD quality tiers | More elaborate planet features are not an All-scale atlas. |
| `westkitty/Starsilk_Cartographer` | Deterministic source/provenance and possibility classification, import/snapshot separation; repo README warns bundled active snapshot is synthetic | Model uncertainty explicitly, never promote exploratory content as truth | It is an ontology/possibility cartographer, not a literal astronomical mapper. |
| `westkitty/Starsilk_Character_Dossier` | Machine canon invariants + published WorldsVault source topology, provenance/relationships | Read-only source truth; selectable linked records and explicit unknown coordinates | No writes, no inferred canonical coordinates. |
| `westkitty/Doom_Map` | Geospatial layered renderer architecture, fidelity A/B/C/D classes, scenario replay intentions, source timestamps | Provenance/fidelity language, distinct render/model stages, layer toggles | Earth geodesy & disaster hazard data do not transfer to fictional galaxies. |

## Independent external precedents (primary sources)

| Project | Evidence | Adopt/adapt |
| --- | --- | --- |
| [syakubson/procedural-galaxy](https://github.com/syakubson/procedural-galaxy) | Seeded deterministic GPU-drawn galaxy, several hundred clickable systems, story/lore, LOD tiers, DOM controls; README discusses frozen spin during interaction, shader time vs structural rotation | **Adopt** seeded point buffers, separated distant/canonical IDs and camera levels; **experiment** idle-mode rotation and GPU timing for larger counts |
| [Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine) | WebGL/Wasm planetarium, Gaia/HiPS large dataset and sky view overlays; repository uses AGPL-3.0 | **Adapt** layered sky and large-data streaming concepts; **avoid** pulling AGPL assets/code into another repository absent compatible licensing |
| [parthdharmale/universe-simulator](https://github.com/parthdharmale/universe-simulator) | React/Three cross-scale cosmic + AU rendering, camera-relative layers, star `Points` batching and impostors | **Adapt** separately anchored scales, eventual GPU shader LOD and per-level lazy streaming. Not evidence that one continuous metric coordinate space works |
| [ericafk0001/threejs-procedral-galaxy](https://github.com/ericafk0001/threejs-procedral-galaxy) | ThreeJS procedural density, interactive camera/settings, MIT source | **Experiment** aesthetic variation knobs after basic performance baseline |
| [Three.js InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html) | Official documentation: share geometries/materials to reduce draw calls | **Adopt** instancing for repeated 3D bodies at scale; current prototype uses batched `THREE.Points` for starfields and a bounded number of unique sphere meshes |
| [zjoooooo/galaxy-explorer](https://github.com/zjoooooo/galaxy-explorer) | Dense galaxy geometry + real-texture planet examples; conflicting MIT marketing header vs README PolyForm Noncommercial license text | **Avoid copying** until license and commercial-use rights reconciled |

## Patterns and counterevidence

- A single giant high-precision `Object3D` coordinate field spanning the All and planetary orbits is a bad abstraction; use independently anchored scale frames and keep narrative topology separate from visual position.
- Procedural geometry is cheap only with bounded GPU resources and star batching. Rendering many explicit 3D stars or per-frame DOM replacement can degrade performance: this prototype uses reusable projected DOM labels, a single loop, capped DPR, ~2k background points and selectable point density.
- A beautiful procedural background does **not** establish accurate Starsilk canonical coordinates. Explicit provenance and visible coordinate-status guard are stronger than photorealistic galactic shaders.
- Falling back entirely to a 2D SVG might simplify mobile accessibility, but would lose the requested spatial orbit, depth, parallax and multi-scale immersion; retain an HTML navigator for non-pointer/failed-WebGL fallback.
- A mature planet simulator already exists. Duplicate orbital physics inside the All atlas would create divergent definitions of accuracy; use a future interop contract, not a hidden copy.

## Opportunities not yet adopted

- GPU shader LOD and camera-relative high-precision anchors; world editing still rebuilds bounded geometry. Load/unload repetitive regression tests before scaling beyond a few dozen galaxies.
- Source-linked structure graph pane with canonical relation edges separate from navigation corridors.
- Accessible HTML fallback to search/edit data when WebGL unsupported; currently the startup error offers export only.
- Optional S Pen hover/calipers, multi-object drag, reversible timeline branches, explicit visual cosmology approvals.

**Evidence boundary:** outside README claims are implementation intentions, not independent device performance proof. Parent-project README CI claims were read, not freshly reproduced in this environment.
