# STARSILK SYSTEM PLANNER

> A tactile 3D stellar-architecture laboratory engineered first for the Samsung Galaxy Tab S9 and S Pen.

[![Verification](https://img.shields.io/badge/Verification-65%2F65%20Passed-0cc6ff)](./OPERATIONAL_STATE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Zero--Errors-blue)](./tsconfig.json)
[![PWA](https://img.shields.io/badge/PWA-Offline--First%20IndexedDB-49e7ff)](./src/persistence/db.ts)
[![Canon Boundary](https://img.shields.io/badge/Canon%20Boundary-Strictly%20Read--Only-crimson)](./CANON_SOURCES.md)

---

## 1. Overview & Fantasy

**STARSILK SYSTEM PLANNER** is a tactile 3D stellar-architecture workbench. The core fantasy is direct, physical manipulation of cosmological causality:
- Grab a moon and throw it into orbit with a live osculating-element aim chip (bound / escape / impact readout) feeding back every millisecond of the drag.
- Draw orbits directly across space using the S Pen with automatic conic ellipse fitting, then sculpt periapsis, apoapsis and inclination with live modal scrubbers before committing as a satellite, ring, or debris belt.
- Accelerate time through eased time-warp (presets 1×–10,000×; engine ceiling 500,000×), forecast future orbital trajectories off-thread via a dedicated Web Worker, and inspect a 30-path Sensitivity Cloud of chaotic perturbations.
- Fork alternate futures into isolated timeline branches, inspect causal diffs in tabular side-by-side matrices, and consult the irreversible Event Ledger.
- Invoke source-backed Starsilk cosmological mechanisms: pull starsilk filaments to collapse stars into black holes, study orbital starbinding lattices, spawn vitrified crimson blood rings, and inspect siege wall tactical zones with unauthored-coordinate honesty.

Every interaction is designed around a tactile obsidian and azure visual language (`#03050A` void, `#0CC6FF` starsilk azure filaments, `#880010` vitrified crimson glass).

---

## 2. Tablet & S Pen First Interaction Model

Targeted for large-format OLED Android tablets (target hardware profile: Samsung Galaxy Tab S9, 120Hz, 16:10 aspect ratio; layout and input modalities are validated in this repository's automated and emulated environments — a physical on-device pass remains outstanding and is honestly labeled as such in OPERATIONAL_STATE.md):

| Input Channel | Primary Interaction | Gesture / Action |
| :--- | :--- | :--- |
| **S Pen Tip** | Fine Spatial Manipulation | Precise selection, raycasting, fitted-conic scrubbing (periapsis / apoapsis / inclination sliders) with live 3D preview. |
| **S Pen Barrel Button** | Quick Grab | One-press instant grab of the body under the nib into Grab & Throw. |
| **S Pen Stroke** | Orbit Loom | Direct drawing of orbital paths across 3D space with real-time conic fitting and apoapsis lock. |
| **Finger Drag** | Camera Orbit / Pan | Natural one-finger orbit rotation around primary focus; two-finger pan across the ecliptic plane. |
| **Two-Finger Pinch** | Camera Zoom | Smooth pinch-to-zoom scaling from planet surfaces to outer Kuiper belt boundaries. |
| **Mouse Wheel** | Camera Zoom (desktop) | Sensitivity-tunable exponential zoom sharing the same pinch pathway. |
| **Double-Tap** | Focus Jump | Double-tap any body to select it and fly the camera to it. |
| **Grab & Throw** | Touch Causality | Tap and hold any celestial body to grab, drag to stretch an azure velocity vector, and release to inject instantaneous momentum with weighted EMA velocity filtering. |

The UI enforces ergonomic two-handed tablet grips: primary tool rail on the left edge, context inspector and telemetry on the right edge, timeline controls across the bottom thumb-sweep zone, and brand/status bar along the top. Default browser touch gestures are suppressed on the 3D canvas via `touch-action: none`.

---

## 3. Architecture & Physics Engine

```
                               ┌─────────────────────────────┐
                               │  STARSILK SYSTEM PLANNER    │
                               │  UI Layer (React 19 + HUD)  │
                               └──────────────┬──────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         ┌─────────────────────────┐                     ┌─────────────────────────┐
         │   Simulation Engine     │                     │      Scene Manager      │
         │ (Fixed Velocity Verlet) │                     │    (Three.js WebGL)     │
         └────────────┬────────────┘                     └────────────┬────────────┘
                      │                                               │
         ┌────────────┴────────────┐                     ┌────────────┴────────────┐
         │                         │                     │                         │
         ▼                         ▼                     ▼                         ▼
┌─────────────────┐       ┌─────────────────┐   ┌─────────────────┐       ┌─────────────────┐
│ Future Worker   │       │ Branch Manager  │   │ Floating Origin │       │ Shaders & Belts │
│ (30-line Cloud) │       │ (Causal Trees)  │   │ (Precision GPU) │       │ (GLSL + Inst.)  │
└─────────────────┘       └─────────────────┘   └─────────────────┘       └─────────────────┘
```

### Symplectic Integrator
- **Velocity Verlet ($O(\Delta t^2)$)**: Adaptive fixed sub-stepping ($\Delta t = 60\text{s}$ at 1×, widening through 2 min, 10 min, 1 h, 4 h, and 8 h tiers as commanded time-warp climbs; commanded rate transitions are slew-eased to avoid integrator shock) ensures symplectic energy conservation. Over a 1,000-step circular orbit integration at 60 s steps, total mechanical energy drift is strictly bounded ($\Delta E / E_0 < 2 \times 10^{-4}$, enforced by automated regression) and semi-major axis varies by $< 0.01\%$.
- **Plummer Softening**: Prevents unphysical infinity singularities and numerical ejection during close hyperbolic encounters.
- **NaN Guards**: State vectors are clamped and sanitised against degenerate floating-point conditions.

### Coordinate & Scale Systems
- **Floating Origin**: The camera tracking body is placed at GPU coordinate `(0, 0, 0)` in each frame, completely eliminating 32-bit single-precision vertex jitter across multi-AU distances.
- **Dual Scale Modes**:
  - **Readable Scale**: Sub-linear distance compression ($d^{0.92}$) and logarithmic radius expansion ($R_{disp} \approx 1.2 \log_{10} R_{km}$) allow simultaneous visual comprehension of both planet surfaces and vast orbital architectures.
  - **True Scale**: 1:1 astronomical proportions where planets appear as authentic specks against stellar voids.

### Collisions & Orbital Mechanics
- **Inelastic Mergers**: Volume-summed sphere calculation and momentum-conserving velocity updates when bodies breach mutual physical collision radii.
- **Astrodynamics**: Real-time computation of osculating orbital elements (semi-major axis $a$, eccentricity $e$, inclination $i$, longitude of ascending node $\Omega$, argument of periapsis $\omega$, true anomaly $\nu$), Hill sphere radii, Roche limits, Lagrange points L1–L5, and mean-motion orbital resonance ratios ($2:1$, $3:2$, $5:2$).

### Thermal & Habitability
- Stefan-Boltzmann incident stellar flux equilibrium calculations, planetary Bond albedo, greenhouse temperature offsets, and dynamic Habitable Zone inner/outer boundary rings.

---

## 4. Signature Capabilities

### 1. Orbit Loom
Select a celestial primary, engage the Orbit Loom tool, and sweep an S Pen or finger stroke through 3D space. The algorithm projects stroke points onto the orbital plane, computes geometric eccentricity and periapsis, derives the required orbital velocity $v_p = \sqrt{\frac{\mu}{a}\frac{1+e}{1-e}}$, and exposes live interactive handles to fine-tune semi-major axis, argument of periapsis, and inclination before committing as a new satellite or dense particle ring.

### 2. Show Future & 30-Line Sensitivity Cloud
An asynchronous Web Worker continuously integrates forward trajectories (120–864 steps per refresh at 300 s steps — roughly 10–72 simulated hours, selectable via the Forecast Horizon setting) without stalling the main 120Hz render thread. When sensitivity analysis is engaged, the worker spawns 30 perturbed shadow universes (default ±1.5% velocity variation, tunable 0.1–5%) to render a translucent turquoise probability fan, illustrating chaotic divergence, gravitational slingshots, and resonance traps.

### 3. Causal Branching & Timeline Ledger
Fork any state into a named branch (e.g., "Prime", "Black Hole Injected", "Moon Thrown"). Compare branches side-by-side in a comparative audit matrix: surviving-body census shifted, per-body orbital shift matrix ($\Delta a$, $\Delta e$, $\Delta v$ from osculating elements), and total mechanical energy delta in joules. Every significant action (ejection, collision, macro trigger, throw) is permanently logged into a bounded Event Ledger (catastrophe-reversal undo bank included).

### 4. Deterministic System Sigil
Every system state generates a unique, deterministic SVG System Sigil derived from live physics: star spectral class (from effective temperature), body census (barcode density), total angular momentum (arc count and tilt), and an extinction regime that scars the sigil crimson when the host star dies. Sigils serve as instant visual identifiers and export/postcard stamps.

### 5. X-Ray Lens, Trails, Labels & Habitable Zones
A right-edge lens rail toggles render layers on demand: recorded orbital trails (sampled path history), distance-faded name sprites, Stefan-Boltzmann habitable-zone annuli around luminous stars, and the X-Ray Lens — osculating ellipse wireframe, Hill sphere, Roche shell, and L1–L5 Lagrange markers projected around the selected body.

### 6. Audible Orrery
An optional synthesized soundscape maps orbital mean motion onto drone voices (inner worlds sing high, outer giants hum low), with a slow sub-bass breath for the star and percussive strikes on collisions. Built entirely on Web Audio oscillators — no audio assets, fully offline-first.

### 7. Resilience & Session Systems
Autosave with rolling checkpoints (suspended while the tab is hidden), pre-catastrophe undo bank (Ctrl+Z), a named saved-systems vault, deep sanitize-on-import with schema migration (1.0.0 → 1.1.0), WebGL context-loss containment, and a first-run coach tour.

---

## 5. Starsilk Canon Lab

The Canon Lab incorporates source-backed cosmological mechanisms derived strictly from canonical dossiers:

- **PULL STARSILK**: Hold-to-confirm (1,800ms) safety latch. Triggers a hyper-dense azure barcode filament collapse, condensing the host star into a spinning black hole ($r_{sch} = 2GM/c^2$), zeroing stellar luminosity, plunging planetary temperatures into cryogenic equilibrium, and stamping the causal ledger.
- **STARBINDING**: Renders ordered hexagonal azure barcode tension lattices connecting primary stars and orbiting worlds, indicating artificial angular-momentum stabilization.
- **BLOOD RINGS**: Deploys vitrified crimson crystalline rings ($R_{in}=1.2R, R_{out}=2.6R$) composed of dark red glass debris with reflective specular lighting.
- **SIEGE WALL TACTICAL ZONE**: Displays spherical exclusion zones and gravitational gradient distortions around military blockade points.
- **Honest Coordinate Handling**: Unauthored coordinates in canon are explicitly badged as `unauthored_in_source: true` rather than inventing fictional astronomical positions.

---

## 6. Verification & Quality Gates

The project maintains a zero-tolerance policy for compiler warnings, broken tests, or untyped code:

```bash
# Execute the full verification suite (Typecheck + Tests + Production Build)
npm run verify
```

| Verification Stage | Command | Status |
| :--- | :--- | :--- |
| **Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0 Errors, Strict Mode** |
| **Unit Tests** | `npm run test` (`vitest run`) | **65/65 Passing (11 suites)** |
| **Production Build** | `npm run build` (`tsc && vite build`) | **Clean Bundle, PWA Generated** |
| **Canon Snapshot** | `npm run canon:refresh` | **Verified Manifest Synced** |

---

## 7. Development & Scripts

```bash
# Install dependencies
npm install

# Start local dev server (default port: 5173)
npm run dev

# Run test suite
npm run test

# Run tests in watch mode
npm run test:watch

# Build production bundle to dist/
npm run build

# Preview production build locally
npm run preview

# Refresh canonical dossier snapshot from remote compendium
npm run canon:refresh
```

---

## 8. License & Repository Boundary

- **Implementation Repository**: `westkitty/Star_System_Planner`
- **Canon Reference**: `westkitty/Starsilk_Character_Dossier` (strictly read-only canonical reference; never modified or pushed to by this repository).
- **License**: MIT
