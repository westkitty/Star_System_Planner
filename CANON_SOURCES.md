# CANON SOURCES & REPOSITORY BOUNDARY SPECIFICATION

> Architectural boundary, source citations, machine endpoints, and unauthored coordinate protocols for STARSILK SYSTEM PLANNER.

---

## 1. Strict Repository Boundary

```
┌─────────────────────────────────────────────────────────┐
│     CANONICAL REFERENCE REPOSITORY (READ-ONLY)          │
│     Repository: westkitty/Starsilk_Character_Dossier    │
│     URL: https://westkitty.github.io/Starsilk_.../      │
│     Policy: STRICTLY READ-ONLY. NO COMMITS. NO WRITES.  │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ HTTPS Sync (refresh-canon.mjs)
                             ▼
┌─────────────────────────────────────────────────────────┐
│     APPLICATION WORKBENCH REPOSITORY (WRITABLE)         │
│     Repository: westkitty/Star_System_Planner           │
│     Branch: main                                        │
│     Directory: ./ (Repository Root)                     │
│     Snapshot: ./src/canon/snapshot/canon-manifest.json  │
└─────────────────────────────────────────────────────────┘
```

The canonical Starsilk Compendium and character dossiers are authored in `westkitty/Starsilk_Character_Dossier`. Under no circumstances should any commit, staging, file modification, or git push be directed from this repository to `Starsilk_Character_Dossier`.

All canon access within `Star_System_Planner` is strictly mediated through:
1. The local bundled snapshot at [`./src/canon/snapshot/canon-manifest.json`](./src/canon/snapshot/canon-manifest.json), ensuring 100% offline functionality.
2. The read-only sync script [`./scripts/refresh-canon.mjs`](./scripts/refresh-canon.mjs) which fetches updated metadata from the public documentation endpoints.

---

## 2. Canonical Machine Endpoints & Hash Locks

The sync script contacts the following public JSON endpoints hosted on GitHub Pages (`https://westkitty.github.io/Starsilk_Character_Dossier`):

| Endpoint Path | Canonical Asset | Description |
| :--- | :--- | :--- |
| `/canon/canon-locks.json` | Hash Locks & Revision Stamps | Content hashes and revision metadata validating dossier freshness. |
| `/worldsvault/worldsvault.json` | WorldsVault Celestial Registry | Authoritative catalog of known planets, orbital stations, and spatial domains. |
| `/machine/entities/starsilk-material.json` | Starsilk Material Specification | Machine-readable entity record for the Starsilk material section, canonical URLs, and source citations. |
| `/machine/entities/cosmic-architecture.json` | Cosmic Architecture Specification | Machine-readable entity record for cosmic architecture, topology nodes, and containment references. |
| `/machine/entities/systems.json` | System Architectures & Blood Rings | Machine-readable entity record for system architectures, Drakken biospheric structures, and related entities. |
| `/machine/entities/worldsvault-templates.json` | Archetype Templates | Machine-readable entity record for WorldsVault archetype display templates. |

### Snapshot Integrity & Provenance Record
The bundled snapshot was synchronized and verified:
- **Timestamp**: `2026-09-09T19:28:00Z`
- **Output Target**: `./src/canon/snapshot/canon-manifest.json`
- **Integrity**: Passed required-field structural validation, zero corrupted entries.
- **Provenance Architecture**: Fetched Dossier records are preserved under `sourceRecord`; planner-maintained interpretations, palette tokens, and pedagogical summaries are segregated under `plannerSummary`.

---

## 3. The Unauthored Coordinate Protocol & Honest Canon Status

A foundational tenet of STARSILK SYSTEM PLANNER is **coordinate and canon honesty**:

> **Rule**: When celestial bodies or stations from the WorldsVault lack precise Keplerian orbital coordinates in canonical literature, the application **MUST NEVER** invent artificial coordinates and present them as established lore. Furthermore, all cosmological mechanisms clearly separate source canon status (`sourceCanonStatus: 'unknown'`) from planner classification (`plannerClassification`).

### Implementation Pattern
When loading bodies from the WorldsVault or Presets:
1. If semi-major axis, eccentricity, or parent primary are not authored in canon, the object record is flagged with:
   ```typescript
   {
     id: "meridian-station",
     name: "Meridian Station",
     unauthored_in_source: true,
     sourceCanonStatus: "unknown",
     plannerClassification: "CANON-INSPIRED SANDBOX",
     sourceCitation: "WorldsVault Dossier: Meridian Orbital Junction",
     // Placed in default demonstrative sandbox orbit for visual study
   }
   ```
2. The UI Context Inspector and Canon Lab present distinctive badges:
   - `[UNAUTHORED COORDINATES - DEMO ORBIT]`
   - `[SOURCE STATUS: UNKNOWN]`
   - `[PLANNER: CANON-INSPIRED SANDBOX]` or `[PLANNER: SOURCE-BACKED MECHANIC]`
3. Any simulated orbital properties are marked as "Demonstrative Sandbox Architecture" rather than "Canonical Ephemeris".

---

## 4. Truthful Source Citations for Cosmological Mechanisms

### Mechanism 1: PULL STARSILK (Stellar Core Extraction & Collapse)
- **Source Stable ID**: `starsilk-material`
- **Source URL**: `https://westkitty.github.io/Starsilk_Character_Dossier/#compendium/starsilk-material`
- **Source Canon Status**: `unknown`
- **Planner Classification**: `SOURCE-BACKED MECHANIC`
- **Supported Description**: Starsilk is literal programmable cosmological substance. Engaging the stellar core and extracting/pulling Starsilk causes immediate loss of stellar stability; the host star collapses toward a black hole and the active system is destroyed.
- **System Consequence**: Sets `systemStatus = 'destroyed_by_starsilk_collapse'`. Irreversible catastrophe event recorded.
- **Safety Precaution**: UI requires an uninterrupted 1,800ms hold gesture. Releasing prematurely resets progress with zero state mutation.

### Mechanism 2: STARBINDING — LOCAL STUDY (Stellar Mass Extraction Study)
- **Source Stable ID**: `starsilk-material`
- **Source URL**: `https://westkitty.github.io/Starsilk_Character_Dossier/#compendium/starsilk-material`
- **Source Canon Status**: `unknown`
- **Planner Classification**: `SOURCE-BACKED EVENT STUDY`
- **Demonstrative Notice**: `DEMONSTRATIVE STUDY — LOCAL SYSTEM ABSTRACTION, NOT GALAXY-SCALE CANON EVENT`
- **Physical Interpretation**: Local sandbox abstraction of simultaneous stellar extraction across all system stars. Sets `systemStatus = 'destroyed_by_starsilk_collapse'`.

### Mechanism 3: CONSTRUCT BLOOD RING (Vitrified Biospheric Atrocity-Structure)
- **Source Stable ID**: `systems`
- **Source URL**: `https://westkitty.github.io/Starsilk_Character_Dossier/#compendium/systems`
- **Source Canon Status**: `unknown`
- **Planner Classification**: `SOURCE-BACKED STRUCTURE`
- **Physical Interpretation**: Drakken biospheric atrocity structure rendered via Gorevault and extruded toward orbit via Ringthroat logic. Formed of vitrified deep-crimson reflective scar material.

### Mechanism 4: SIEGE WALL — LOCAL SANDBOX STUDY (Spatial Interdiction Study)
- **Source Stable ID**: `cosmic-architecture`
- **Source URL**: `https://westkitty.github.io/Starsilk_Character_Dossier/#compendium/cosmic-architecture`
- **Source Canon Status**: `unknown`
- **Planner Classification**: `CANON-INSPIRED SANDBOX`
- **Demonstrative Notice**: `DEMONSTRATIVE GEOMETRY — NODE COUNT AND SPACING ARE NOT CANON`
- **Physical Interpretation**: Demonstrative study of black hole containment perimeter. Node count (6 nodes at 6 AU) is demonstrative sandbox geometry, not authored canon. Visual rendering represents starless black void absence rather than decorative energy barriers.

---

## 5. Refresh Procedure

To safely refresh the local canon snapshot when connected to the network:

```bash
# Execute read-only sync script
npm run canon:refresh
```

This runs `scripts/refresh-canon.mjs`, which downloads JSON data from `https://westkitty.github.io/Starsilk_Character_Dossier/`, validates the format, and writes the updated snapshot to `src/canon/snapshot/canon-manifest.json`.
