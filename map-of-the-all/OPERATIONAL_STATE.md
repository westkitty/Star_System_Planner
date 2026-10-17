# Atlas Operational State

project_id: starsilk-map-of-the-all
project_name: The Map of the All — 3D Prototype
revision: 2

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
