# Map of the All — Phase 2: source topology and orbital handoff

## Current capabilities

**WorldsVault source graph:** The Atlas now includes an independently accessible, read-only source-relationship diagram. It derives 11 identity records and 6 exact relation triples from `westkitty/Starsilk_Character_Dossier/docs/worldsvault/worldsvault.json` (Git blob SHA `862bc476fb8165784704151eed35c915cbf31bf4`). It preserves direction and named relation. The five diagram columns are explicitly editorial grouping, **not** physical positions. The separate draft space map and its editable routes have no write access to this source topology. Link controls open precise published source pages and relationship anchors. The source file assigns per-node `canon_status: unknown`; publication does not silently promote it to established canon.

**System Planner export:** Selecting any draft star system (or entering its view) enables **EXPORT SYSTEM .SSP**. The export produces a complete version-`1.1.0` System Planner save with a central hypothetical star and the system's draft planets. Every physical parameter (star mass, planetary mass, radii, orbital distances, circular velocities) is intentionally **illustrative** and marked `sourceCanonStatus: unknown`, `plannerClassification: NON-CANON SANDBOX`, and `unauthored_in_source: true`. The only atlas values forwarded are object IDs, display names, colors and a stylized orbital phase angle. Draft cartographic coordinates do **not** become AU/kilometers or canon.

**Handoff sequence:** Choose a system, click **EXPORT SYSTEM .SSP**, click **OPEN PLANNER**, then use the existing planner's import action to load the downloaded `.ssp.json`. The Atlas never silently injects state, overwrites the planner autosave, changes physics, or publishes canon. Opening the parent link works when the Atlas is hosted under `Star_System_Planner/map-of-the-all/`; standalone Vite setups have no parent planner at that URL.

## Protected boundaries

- Dossier files, canonical reference media, source locks, and generated Pages are strictly read-only.
- Topological relations are separate from editable Hookshot/Starsilk route curves.
- No missing distances, positions, star census, timeline placement, or simulation orbital parameters are inferred as canon.
- Atlas draft JSON schema and its storage key are unchanged, avoiding import migration and old-saved-draft loss.
- The existing parent renderer, simulation engine, and save architecture remain untouched.

## Verification contract

- `node --test map-of-the-all/tests/*.node-check.mjs` checks topology cardinality, directionality, source URLs, no fabricated geometry, handoff safety bounds, circular-orbit parameters, non-mutation, and markup controls.
- A new parent Vitest regression checks `.ssp.json` output through the **actual** `parseProjectWithDiagnostics` and `parseAndValidateProjectJson` importer functions.
- `npm run typecheck && npm run test && npm run build && npm run bundle:report` gates main code and the new Vite entrypoint.
- Desktop/mobile browser interaction of the new source dialog and orbital file import require runtime observation; a TypeScript build or passing unit test alone does not prove those interactions.
- Physical Galaxy Tab S9/S Pen latency, 120 Hz performance, memory soak and thermals are not proven by browser emulation.

## Follow-on (not implemented)

- Cryptographic update comparison against future Dossier snapshots (do not silently mutate the published graph).
- User-verified bidirectional roundtrip from the parent simulation back to the atlas, with explicit coordinates/unit transformations.
- Canon provenance conflict review UI before any promotion to official lore.
- Physical-device gesture, GPU and memory profiling; high-density LOD streaming and style-lens customization.
