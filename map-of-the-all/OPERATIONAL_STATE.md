# Atlas Operational State

project_id: starsilk-map-of-the-all
project_name: The Map of the All — 3D Prototype
revision: 1

## Current baseline

- Parent Git repository: `westkitty/Star_System_Planner`, not the read-only Dossier.
- Artifact lives under `map-of-the-all/`; original parent `src/`, entrypoint, assets, simulation and canon snapshot are **protected**.
- Local canvas/page code and versioned JSON schema v1 exist.
- 7 starting galaxies, 35 starting systems, 105 starting planets, 2 labeled source-identity landmarks, 10 proposed corridors. Every numeric coordinate is generated/editorial.
- No physical distance/ephemeris or canonical territory is asserted.
- The UI separates read-only source-linked landmarks from editable drafts; imports demote any source-identity claim.
- The advanced planet simulator is not coupled or replaced.

## Verification states

- JS syntax: run `node --check` for all 3 JS files.
- Schema invariant tests: run `node --test tests/atlas-data.node-check.mjs`.
- HTML/CSS static inspection: review source and snapshots.
- WebGL/browser/physical tablet performance: **unverified** until representative hardware exercises the app.
- Parent repo CI, GitHub Pages publishing, and remote push: determined from actual post-commit workflow evidence, not source presence.

## Protected invariants

- `Starsilk_Character_Dossier` has no write route from atlas code.
- Exact source-first nature of the WorldsVault topology; non-canonical coordinates must not be presented as authoritative.
- Blood Eclipse War length is 170 years. Starsilk is cyan/azure.
- Siege Wall visually signals a black-hole containment lattice and absence, not a solid mundane wall.
- The source concepts may not be deleted or modified; fork into drafts.
- Keep portal path `map-of-the-all/` isolated from parent root behavior.

## Pending / unknown

- Production visual QA, physical Tab S9 S Pen gesture latency and performance.
- Source-live update path and authoritative spatial coordinate authoring (none published).
- Future 4X strategic simulation and timeline snapshots (not included in this prototype).
- Source-linked WorldsVault constellation graph, independent of illustrative galactic geometry.
