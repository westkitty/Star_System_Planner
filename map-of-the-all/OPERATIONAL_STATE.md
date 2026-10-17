# Atlas Operational State

project_id: starsilk-map-of-the-all
project_name: The Map of the All — 3D Prototype
revision: 7

## Current baseline

- Parent Git repository: `westkitty/Star_System_Planner`, not the read-only Dossier.
- Artifact lives under `map-of-the-all/`; original parent `src/`, entrypoint, assets, simulation and canon snapshot are **protected**.
- Local canvas/page code and versioned JSON schema v1 exist.
- 7 starting galaxies, 35 starting systems, 105 starting planets, 2 labeled source-identity landmarks, 10 proposed corridors. Every numeric coordinate is generated/editorial.
- No physical distance/ephemeris or canonical territory is asserted.
- The UI separates read-only source-linked landmarks from editable drafts; imports demote any source-identity claim.
- The advanced planet simulator is not coupled or replaced.

## Verification states

- VERIFIED (2026-10-17): Node atlas schema, safety and editor-markup tests; JavaScript syntax.
- VERIFIED (2026-10-17): parent TypeScript checks; 230/230 pre-existing Vitest tests; Vite production multi-page build, bundle/PWA budget.
- VERIFIED (desktop Brave): WebGL viewport, projected labels, 11 layer toggles, rename and local autosave through reload, All-to-galaxy-to-system navigation, added planet/annotation, JSON export, parent entrypoint HTTP 200, zero observed runtime page exceptions or HTTP failures.
- VERIFIED (emulated touch): 1280x800 tablet and 412x915 phone viewports, no page errors or horizontal overflow; inspector dismissal and hidden unselected edit form.
- NOT VERIFIED: Galaxy Tab S9/S Pen physical behavior, hardware frame rates and thermals, long-session reliability, production GitHub Pages publication, canonical map coordinates.
- After committing, confirm the remote feature-branch commit and push against GitHub evidence. This state file is not proof of publication.

See docs/QA_EVIDENCE.md for observed browser paths and evidence limits.

## Protected invariants

- `Starsilk_Character_Dossier` has no write route from atlas code.
- Exact source-first nature of the WorldsVault topology; non-canonical coordinates must not be presented as authoritative.
- Blood Eclipse War length is 170 years. Starsilk is cyan/azure.
- Siege Wall visually signals a black-hole containment lattice and absence, not a solid mundane wall.
- The source concepts may not be deleted or modified; fork into drafts.
- Keep portal path `map-of-the-all/` isolated from parent root behavior.

## Pending / unknown

- Physical Tab S9 S Pen gesture latency and performance, real-device visual QA and public deployment.
- Source-live update path and authoritative spatial coordinate authoring (none published).
- Future 4X strategic simulation and timeline snapshots (not included in this prototype).
- Source-linked WorldsVault constellation graph, independent of illustrative galactic geometry.

## Phase 2 scope, 2026-10-17

- New read-only WorldsVault conceptual topology module: exact 11 published identities and 6 directed, source-cited relations, provenance pinned to Dossier Git blob `862bc476fb8165784704151eed35c915cbf31bf4`; no authored distance/position/route is inferred.
- New opt-in orbital laboratory export with explicit `NON-CANON SANDBOX` classification and unknown canon status. Exports compatible `.ssp.json` files for manual user import into existing System Planner. No parent autosave, simulation, or source canon write routes.
- Added focused Node source/bridge tests and a test that invokes the actual System Planner importer, plus branch/PR GitHub Actions validation workflow.
- **Verified locally in this phase:** 21 Atlas Node tests pass and JavaScript syntax checks pass against the isolated project source.
- **Awaiting CI/runtime proof:** parent Vitest importer compatibility, TypeScript, multi-page production bundle, new graph UI interaction, actual import journey, and mobile hardware behavior. Prior Phase 1 browser evidence remains valid only for the earlier version.
- Preserve external source identity priority and never promote the source's `canon_status: unknown` to canonical.

## Phase 3 state, 2026-10-17

- Isolated Spatial Studio (Orbit / Move / Route / Label), controlled pointer interactions, bounded normalized label offsets and 3 visual lenses. Works with schema-v1 legacy drafts without migration.
- Move and label drag produce preview-only pointer updates; one release = one Undo entry. ESC/cancel makes no draft edit. No extra Three.js frame owner added. Source-linked concepts are not draggable.
- Route authoring checks same parent/kind, forbids source links and duplicate corridors. Snap units are display units only.
- Local pure regression run: **29 Atlas Node tests passed** including Phase 2 and new Phase 3 fixtures; JS syntax checked locally.
- CI workflow augmented with Playwright/Chromium interaction check; verify actual run status after push. Physical Tab S9 stylus hover, thermals, target FPS, accessibility walk and deployed Pages remain unverified.
- Protected: Dossier, original parent src, simulator physics, visual canon identity and topology source graph.

## Phase 4 candidate, 2026-10-17

- Added optional `regions` to legacy Atlas v1 draft schema, with safe polygon topology limits and no import elevation of canon identity. Region data remains editorial only, separate from read-only Dossier WorldsVault relations.
- Group selection (up to 32 draft nodes), atomic rigid translations with snap/clamping, accessible nudge and drag, selection marquee. Region creation from group hull or pointer-drawn points, vertex edit and 4X-style member/route reports. Only Atlas app files and the CI script/workflow have changed.
- **Locally verified:** 11 Phase 4 pure Node tests passing, JS syntax checks, and full DOM editor-control ID coverage. Earlier Phase 3 verification is a baseline, not Phase 4 browser proof.
- **Awaiting fresh CI and runtime proof:** full parent tests, build/budgets, group move and vertex browser interactions, physical Galaxy Tab S9/S Pen tests. Do not claim a final Phase 4 pass until CI finishes.

## Phase 5 candidate, 2026-10-17

- The Network Intelligence Lab derives the active-tier draft graph, minimum-hop paths, disconnected components and cut-edge bottlenecks; it offers temporary hypothetical lane closures and read-only before/after reports.
- A projected SVG overlay reuses the existing 3D engine camera/controls without owning another frame loop. One explicit proposed-link action uses the existing route validation, draft mutation, Undo and persistence path.
- No changes to saved schema v1, physical distances, source identity canon, Dossier, protected original parent simulation, or external services.
- **Verified locally:** 13 new pure Node tests (path BFS, filters, undirected multigraph bridges, closures, tier bounds and source protection) and JavaScript syntax/DOM wiring checks. Full CI and browser journey need evidence from this commit's workflow run.
- Phase 4 actually passed its full Actions QA at https://github.com/westkitty/Star_System_Planner/actions/runs/39028632301, including Phase 3/4 Chromium testing, 42 Atlas Node tests, original planner tests, TypeScript and bundle gates.
- **Unverified:** physical Galaxy Tab S9 stylus/touch thermals; platform-wide frame times, user approval of actual canonical layout, merge and Pages deployment.

## Phase 6 / release candidate (2026-10-17)

- Added optional `timeline.version=1` with `war`, `locking`, `post` editorial snapshots. Each snapshot owns draft nodes, routes, regions, and layer visibility; animation quality and typography scale stay global.
- Current top-level state mirrors the selected snapshot for backward compatibility. All mutating editor paths sync the active era before validation; switches and explicit copies are undoable. No generated real dates, mathematical ephemerides, canonical travel times, or sovereign borders.
- New temporal model validates every nested snapshot through the parent Atlas validator, rejects incoherent mirrors and incomplete manifests, and demotes all imported reference identities across all eras.
- Separate comparison panel, discrete scrubber, per-era notes, and read-only SVG camera-projected change trails. Three.js still owns one render loop.
- **Verified locally:** 14 Phase 6 Node tests and JavaScript syntax checks. **Full feature CI, browser interaction and public deployment remain unverified until successful run evidence is captured**.
- Release scope explicitly authorized: stage/commit/push feature; PR merge all prior phases into main; main branch GitHub Actions Pages deployment with live root and Atlas HTTP verification. The original planner app remains the root entry.
- New `.github/workflows/deploy.yml` gates Atlas model tests, all four browser journeys, root bundle gates, and post-deploy public URL proof. Do not claim deployed until actual Pages run and HTTP evidence exist.
