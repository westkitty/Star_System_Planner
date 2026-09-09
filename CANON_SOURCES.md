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
│     Directory: /Users/andrew/Star_System_Planner        │
│     Snapshot: src/canon/snapshot/canon-manifest.json    │
└─────────────────────────────────────────────────────────┘
```

The canonical Starsilk Compendium and character dossiers are authored in `westkitty/Starsilk_Character_Dossier`. Under no circumstances should any commit, staging, file modification, or git push be directed from this repository to `Starsilk_Character_Dossier`.

All canon access within `Star_System_Planner` is strictly mediated through:
1. The local bundled snapshot at [`src/canon/snapshot/canon-manifest.json`](file:///Users/andrew/Star_System_Planner/src/canon/snapshot/canon-manifest.json), ensuring 100% offline functionality.
2. The read-only sync script [`scripts/refresh-canon.mjs`](file:///Users/andrew/Star_System_Planner/scripts/refresh-canon.mjs) which fetches updated metadata from the public documentation endpoints.

---

## 2. Canonical Machine Endpoints & Hash Locks

The sync script contacts the following public JSON endpoints hosted on GitHub Pages:

| Endpoint Path | Canonical Asset | Description |
| :--- | :--- | :--- |
| `/canon/canon-locks.json` | Hash Locks & Revision Stamps | Content hashes and revision metadata validating dossier freshness. |
| `/worldsvault/worldsvault.json` | WorldsVault Celestial Registry | Authoritative catalog of known planets, orbital stations, and spatial domains. |
| `/machine/entities/starsilk-material.json` | Starsilk Material Specification | Physical properties: tensile strength, light refraction, barcode frequency, collapse threshold. |
| `/machine/rulesets/starsilk-mechanisms.json` | Starsilk Cosmological Ruleset | Operational parameters for Starbinding, Gravitational Siphoning, and Filament Tension. |

### Snapshot Integrity Record
The bundled snapshot was synchronized and verified:
- **Timestamp**: `2026-09-09T19:28:00Z`
- **Output Target**: `src/canon/snapshot/canon-manifest.json`
- **Integrity**: Passed schema validation, zero corrupted entries.

---

## 3. The Unauthored Coordinate Protocol

A foundational tenet of STARSILK SYSTEM PLANNER is **coordinate honesty**:

> **Rule**: When celestial bodies or stations from the WorldsVault lack precise Keplerian orbital coordinates in canonical literature, the application **MUST NEVER** invent artificial coordinates and present them as established lore.

### Implementation Pattern
When loading bodies from the WorldsVault:
1. If semi-major axis, eccentricity, or parent primary are not authored in canon, the object record is flagged with:
   ```typescript
   {
     id: "meridian-station",
     name: "Meridian Station",
     unauthored_in_source: true,
     sourceCitation: "WorldsVault Dossier: Meridian Orbital Junction",
     // Placed in default demonstrative sandbox orbit for visual study
   }
   ```
2. The UI Context Inspector and Canon Lab present a distinctive badge:
   `[UNAUTHORED COORDINATES - DEMO ORBIT]`
3. Any simulated orbital properties are marked as "Demonstrative Sandbox Architecture" rather than "Canonical Ephemeris".

---

## 4. Source Citations for Cosmological Mechanisms

### Mechanism 1: PULL STARSILK (Gravitational Siphoning & Collapse)
- **Source Citation**: *Starsilk Material Mechanics, Section 4: Filament Tension and Singularity Triggering.*
- **Physical Interpretation**: When starsilk filaments woven through a stellar core are pulled taut with critical harmonic tension, gravitational feedback collapses the core into a Kerr-type black hole.
- **Safety Precaution**: UI requires an uninterrupted 1,800ms hold gesture. Releasing prematurely resets progress with zero state mutation.

### Mechanism 2: STARBINDING (Orbital Resonance stabilization)
- **Source Citation**: *Stellar Weaving Compendium: Harmonic Locking of Planetary Systems.*
- **Physical Interpretation**: Filament lattices woven between a host star and surrounding planets distribute angular momentum and artificially damp chaotic orbital eccentricities, stabilizing resonance ratios ($2:1$, $3:2$, $5:2$).

### Mechanism 3: BLOOD RINGS (Vitrified Crimson Glass)
- **Source Citation**: *Dossier: The Shattered Verge & Post-Siege Orbital Rings.*
- **Physical Interpretation**: Planetesimal remnants vitrified by high-energy stellar cascades create dense crystalline rings characterized by deep red refractive glass particles with high specular albedo.

### Mechanism 4: SIEGE WALL (Spatial Interdiction Zones)
- **Source Citation**: *Planetary Defense and Interdiction Envelopes, Vol. 2.*
- **Physical Interpretation**: Artificial spatial exclusion boundaries demarcated by gravity gradient distortion fields, visible in tactical HUD overlays.

---

## 5. Refresh Procedure

To safely refresh the local canon snapshot when connected to the network:

```bash
# Execute read-only sync script
npm run canon:refresh
```

This runs `scripts/refresh-canon.mjs`, which downloads JSON data from `https://westkitty.github.io/Starsilk_Character_Dossier/`, validates the format, and writes the updated snapshot to `src/canon/snapshot/canon-manifest.json`.
