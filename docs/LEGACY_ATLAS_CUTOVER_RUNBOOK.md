# Legacy Map of the All — Owner Backup and Cutover Runbook

> **Owner decision — 2026-10-21:** Prior Atlas browser data was explicitly declared disposable; no important draft work needs preservation. For this one cutover, owner-authorized **loss of pre-cutover browser drafts** supersedes the historical mandatory personal-backup prerequisite. Existing code/canon and the independent root Planner remain protected. Do not erase browser localStorage in the release pipeline; the waiver is permission to publish without recovery, not permission to delete files. Stale PWA tabs may still write and should be closed after publication. The temporary cutover gate is main-only, validates the exact read-only portal blob, expires 2026-10-23 UTC, and still runs all native/Chromium/Pages checks. The historical individual proof fields remain BLOCKED rather than mislabeled VERIFIED. This temporary exception is not standing authority for later releases.\n\n
**State:** candidate only. The root Star System Planner remains the orbital simulator. The retired Atlas route is a read-only portal to `https://westkitty.github.io/Starsilk_Map_of_the_All/`.

## Why this is required

Both the previous embedded Atlas and the separate dedicated Atlas run on `https://westkitty.github.io`, so different URL paths **share localStorage**. Both use `starsilk.map-of-the-all.draft.v1` and JSON `version: 1`. A real two-client Chromium test proved the old Atlas can overwrite a modern three-era draft, remove fields, and leave valid-looking JSON. No pure schema check prevents this.

The new portal never loads the legacy editor module, changes the saved key, or automatically migrates data. Its download button exports the **exact raw bytes**, including malformed JSON, from the browser profile's localStorage. The independent root Planner still uses its existing React/TypeScript physics app and independent persistence.

## Real owner backup — REQUIRED before production publication

1. In the browser/profile holding the most complete work, stop making edits; do not open the legacy and dedicated Atlas together. **Do not clear site data.** Close other writable Atlas tabs only after extracting distinct unsaved/in-memory work.
2. Use the existing Atlas **Explore → Export** to download JSON. Keep the untouched original, dated, outside browser storage. If the old UI will not load, a read-only forensic export of the actual browser key can be performed with owner consent; do not use a script that changes browser storage.
3. Make a second physical/file-system copy. Verify that the original file is readable without using an online JSON validator. Preserve its raw bytes and checksum.
4. In an **independent disposable browser profile** (not merely a different page path on the same profile), open the dedicated Atlas and use guarded **Explore → Import** on a *copy* of the file. Review the 3-era summary, choose **Download Backup First**, then **Proceed With Import** in that isolated profile only.
5. Reload the independent profile, inspect War / Locking / Post independently, check edited systems, planets, routes, labels, regions, era suppressions and Undo/Redo or intentional source-status demotion where applicable. Compare against the original.
6. Keep the original unchanged. Record only a non-sensitive verification receipt (checksum, test date, browser profile isolation and pass/failure); **never commit personal draft bytes to GitHub**.

An export alone is not independent restoration. If these steps cannot be completed, keep the release blocked.

## Safe legacy-route retirement procedure

1. Revalidate candidate Planner branch from exact `main` baseline; inspect diffs and CI. Do not merge while the real owner backup is unverified.
2. Verify the read-only portal's backup control downloads exact raw JSON; empty profiles remain unchanged; corrupted raw JSON is not rewritten; root Planner mounts. Replay the genuine old/new collision on the *old build* as a regression witness, then the non-writing portal on the candidate build.
3. Inventory already-open legacy Atlas tabs, installed PWAs, and service-worker caches. Old in-memory or offline-cached JavaScript **can still write**. No static GitHub Pages update can universally stop those running scripts. Require owner-operated close/update of old tabs and separate recovery of distinct edits. Do not conflate a successful new visit with stale-tab retirement.
4. Keep `docs/LEGACY_ATLAS_CUTOVER_READINESS.json` default-deny until each actual proof has a verifiable, human-reviewed receipt. To publish, separately set `LEGACY_RETIRE_APPROVED_SHA` to **the exact merge SHA**, not a feature-branch SHA. This must be done only after all proof gates are satisfied.
5. After authorized deployment, independently verify both public URLs: root Planner operates with its existing orbital controls and PWA; legacy Atlas path shows the read-only portal and exports bytes; dedicated Atlas opens and imports saved drafts. Confirm that reloading the portal does not write the shared key.

## Rollback rule

Rollback must not silently re-enable the old writable editor against modern drafts. A safe rollback can revert the **portal presentation** to another read-only notice or temporarily suspend the route while preserving exact backups. Restoring the historical writer requires a separate, verified data-isolation design. Keep each old draft export recoverable and never use an old editor as a fallback writer.

## Proof inventory and limits

- **Source and CI:** `src/tests` Vitest and TypeScript prove independent root Planner logic; the new Chromium smoke proves root React mount, read-only portal and exact-byte download. Archived legacy schema tests are historical, not live route tests.
- **Cross-repository:** The dedicated Atlas's Phase 6 two-compiled-client suite validates the exact retired-page candidate in an ephemeral Planner checkout; compare original source SHA and candidate release SHA before production.
- **Not proven by synthetic CI:** the owner's specific draft restored successfully, all old tabs and PWAs retired, physical Galaxy Tab S9 Ultra / S Pen, or live Pages cutover.
- **Canon:** Dossier remains read-only. No new Starsilk coordinates, borders, routes, distances or canon dates are declared. Blood Eclipse War remains 170 years.

**Do not publish until owner restore, cached-client risk, rollback and exact release authorization are genuinely resolved.**
