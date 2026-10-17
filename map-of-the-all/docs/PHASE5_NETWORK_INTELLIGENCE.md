# Map of the All — Phase 5: Hookshot Network Intelligence

## Purpose

Continue the existing editable 3D Atlas without adding another render loop, creating authoritative cartography, or replacing the parent orbital simulator.

The **Network Intelligence** panel is a 4X-inspired planning instrument. It reasons over the current tier's **draft** galaxies, systems or planets and their proposed Hookshot / Starsilk connections. Draft network topology is NOT the Dossier's WorldsVault **published source graph**. Its findings do not establish travel time, astrophysical distance, political permission, safe passage, ownership, or real historical positions.

## Features

- Three explicit filters: all draft lanes, proposed Hookshot lanes, and proposed Starsilk lanes.
- Deterministic BFS for the **minimum number of corridor hops**. One hop is one stored draft edge, with no weights, velocity or units.
- Connected-component and isolated-node counts.
- Single-corridor cut edges (bridges) computed using Tarjan-style low-link traversal. Parallel lanes are not falsely reported as single-corridor failures.
- Temporary per-lane outages and a before/after disruption report. The closures are local transient UI state, never committed or written to JSON.
- Highlighted route arcs and endpoints projected into the current 3D view using the AtlasEngine's existing camera. No WebGL duplication or second RAF loop.
- Optional explicit **Commit Draft Corridor**, which invokes the existing `change()` mechanism, enforces `validateCorridor()`, and creates one undoable edit. Both endpoints must be editable draft objects at the same tier and parent; read-only source concepts are excluded.
- Responsive pointer/touch interface and meaningful keyboard-first route selection. No new runtime dependencies or network calls.

## Comparative scout and implementation decisions

1. [Graphology's unweighted shortest-path module](https://graphology.github.io/standard-library/shortest-path.html) distinguishes unweighted shortest hops from Dijkstra/A-star weighted metrics. **Adopt** minimal unweighted BFS because Starsilk draft routes have no documented distances or transit durations; adding weights would fabricate physical precision.
2. [Graphology's connected-components tools](https://graphology.github.io/standard-library/components.html) provide a known abstraction for clusters and isolated nodes. **Adapt** a tiny deterministic implementation to our bounded 750-node/1000-corridor graph rather than adopting another runtime package.
3. [Three.js guidance for projecting HTML to 3D](https://threejs.org/manual/pages/align-html-elements-to-3d.html) favors camera projection for DOM-aligned overlays. **Adopt** a DOM/SVG route projection instead of a second graphics renderer; hide off-camera points and update on OrbitControls camera changes.
4. [Stellaris network documentation](https://agentmystia.github.io/StellarisWiki/FTL_travel.html) demonstrates the strategic interest of chokepoints in fictional hyperlane maps. **Adapt** only the graph-theory UI pattern; **reject** importing Stellaris's exploration, ownership, travel and visibility rules into Starsilk canon.

## Architecture and invariants

- `network-analysis.js`: pure deterministic state-projection, BFS, connected components, bridge detection and closure comparison. Accepts a view and optional route filter; never mutates state.
- `network-lab.js`: semantic read-only controls and a transient SVG projector. It owns temporary closures and endpoint selections; `main.js` remains the sole route-creation/persistence/Undo authority.
- `network.css`: responsive controls, projected highlight styles, 40px minimum touch actions.
- `main.js`: narrow integration callback for a new route; passes through the existing validation and `change()` ledger. Prior Phase 1–4 modules stay isolated.
- Existing `state.version===1` and `STORAGE_KEY` are unchanged. No migration, new remote services, or autorun background tasks.
- Every alternative-route display and critical-edge metric is editorial connectivity. A site being graph-reachable does not imply safety, authorization, physical accessibility, travel feasibility, or historical reality.
- Never convert the six Dossier WorldsVault relationship edges into physical travel routes.

## Acceptance criteria

1. Graph model test verifies 7 default draft galaxies / 10 draft corridors, minimum 3-hop North Reach to Southern Territories path, closure of two incident lanes isolating North Reach, edge-kind filtering, and no atlas state mutation.
2. Model tests verify multigraph bridge correctness, exclusion of reference landmarks, graph bounds, ancestor tier filtering, and corridor-authoring safeguard compatibility.
3. Existing 42 Node and parent Vitest tests, TypeScript, production build and bundle budgets continue passing.
4. Chromium user journey confirms visible route trace, path highlighting, two closure toggles, recovery, explicit creation of one draft corridor, Undo, tier navigation and original planner/source graph preservation.
5. Emulated mobile viewport confirms Network Lab access, minimum touch target and no horizontal overflow. Physical Samsung Tab S9 Ultra / S Pen latency and thermal performance still require independent on-device proof.
6. Do not merge to main or deploy to Pages as part of this feature branch increment.

## Reproduce

From the parent repository root:

```bash
npm ci
node --test map-of-the-all/tests/*.node-check.mjs
npm run test
npm run typecheck
npm run build
npm run bundle:report
```

For browser acceptance, in a Chromium-capable QA runner with Playwright Core available:

```bash
node scripts/phase5-browser-ci.mjs
```

`phase5-browser-ci.mjs` starts and stops a private Vite preview. The CI workflow installs Playwright Core only for testing, without modifying the project's pinned runtime dependencies.
