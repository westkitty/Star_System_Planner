# STARSILK SYSTEM PLANNER — Recursive Self-Improvement Log

Each entry records one complete improvement iteration: exactly 60 worthwhile
changes (15 UI + 15 assets/rendering + 15 gameplay/simulation + 15 backend),
validation evidence, and the commit that carries them.

---

## Iteration 1 — 2026-09-13 — `improve: recursive project pass 1`

**Theme:** systems integration — wire every subsystem together (event bus,
undo, challenges, forecasts, persistence) and give the planner a complete HUD.

### UI (UI01–UI15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| UI01 | Full keyboard-shortcut system: central registry, ShortcutsModal (`?`), App dispatcher, ToolRail hints | `src/ui/shortcuts.ts`, `src/ui/ShortcutsModal.tsx` |
| UI02 | Toast notification system with global imperative push, bus-driven success/warning toasts | `src/ui/toast.tsx`, `App.tsx` bus wiring |
| UI03 | Boot splash with staged progress + failure-path diagnostics download | `src/ui/BootSplash.tsx` |
| UI04 | Four-step onboarding coachmark tour, replayable from Settings | `src/ui/OnboardingOverlay.tsx` |
| UI05 | System navigator: searchable body census panel, persisted visibility | `src/ui/SystemNavigator.tsx` |
| UI06 | Selection chip with focus/grab/deselect quick actions | `src/ui/SelectionChip.tsx` |
| UI07 | Fork-branch modal with naming + branch census | `src/ui/ForkBranchModal.tsx`, `TimelineBar` |
| UI08 | Confirm dialog guarding destructive actions (delete body, reset, import) | `src/ui/ConfirmDialog.tsx` |
| UI09 | Illustrated empty states (event ledger, branch compare) + ledger severity filters | `EventLedgerModal`, `BranchCompareModal` |
| UI10 | Modal accessibility: focus trap, Esc-to-close, focus restore on all dialogs | `src/ui/modal-a11y.ts` + all modals |
| UI11 | Settings modal: audio, autosave, motion, HUD hints, navigator, tour replay | `src/ui/SettingsModal.tsx` |
| UI12 | System statistics dashboard: census, energetics, stability score | `src/ui/SystemStatsModal.tsx`, `src/simulation/system-stats.ts` |
| UI13 | Missions panel surfacing challenge roster + reset | `src/ui/MissionsPanel.tsx` |
| UI14 | TopBar transport upgrade: preset switcher (incl. procedural), undo depth, autosave + FPS pills | `src/ui/TopBar.tsx` |
| UI15 | One-click diagnostics export (structured log + event history JSON) in Settings + boot screen | `SettingsModal`, `App.downloadDiagnostics` |

### Assets / rendering (ASSET01–ASSET15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| ASSET01 | Spectral-class palette (O–M anchors) + star-creation picker | `src/rendering/star-palette.ts`, `CreateBodyModal` |
| ASSET02 | Procedural planet surface textures (rocky/oceanic/desert/gas/ice) bound to shader | `src/rendering/planet-textures.ts`, `celestial-shaders` `uSurfaceMap` |
| ASSET03 | Atmosphere shells + stellar corona sprites | `src/rendering/sprite-assets.ts` |
| ASSET04 | Accretion disks for compact objects | `src/rendering/accretion-disk.ts` |
| ASSET05 | GPU collision-burst particle pool, bus-triggered | `src/rendering/collision-bursts.ts` |
| ASSET06 | Habitable-zone ring renderer with visibility toggle | `src/rendering/habitable-rings.ts` |
| ASSET07 | Lagrange-point (L1–L5) marker groups | `src/rendering/lagrange-markers.ts` |
| ASSET08 | Animated selection indicators | `src/rendering/selection-indicator.ts` |
| ASSET09 | Throw-vector gradient arrows for grab-and-throw aiming | `src/rendering/velocity-arrow.ts`, `grab-and-throw` |
| ASSET10 | Trajectory renderer: escape coloring + pooled collision markers | `src/rendering/trajectory-renderer.ts` |
| ASSET11 | Deterministic seeded starfield | `scene-manager` + `SeededRng` |
| ASSET12 | Nebula veil backdrop layers | `sprite-assets.createNebulaVeils` |
| ASSET13 | PWA icon set refresh (maskable SVG set, apple-touch-icon, manifest wiring) | `public/`, `index.html`, `vite.config` |
| ASSET14 | Reduced-motion support gating all scene animation | `scene-manager.reducedMotion` + settings |
| ASSET15 | Temperature-true star rendering from spectral class / mass | `scene-manager` star material path |

### Gameplay / simulation (GAME01–GAME15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| GAME01 | Single-step physics advance (`.` key + transport button) | `engine.stepOnce()` |
| GAME02 | Throw-release gameplay events feeding challenges + audio | `throw:released` bus flow |
| GAME03 | Collision consequences: bursts + thump + ledger entries | `collision:occurred` bus flow |
| GAME04 | Forecast collision alerts (watch/warning/imminent) with HUD banner | `src/simulation/forecast-alerts.ts` |
| GAME05 | Escape-trajectory detection (`orbit_unbound`) | `src/simulation/event-monitor.ts` |
| GAME06 | Roche-limit breach detection | `event-monitor` tidal check |
| GAME07 | Thermal-regime classification + transition events | `thermalRegimeFor` |
| GAME08 | Undo stack with labeled checkpoints (delete/macro/preset/import) | `src/simulation/undo-stack.ts` |
| GAME09 | Delete/clone/import flows all checkpointed before mutation | `App.tsx` handlers |
| GAME10 | Prograde/retrograde/radial Δv nudge maneuvers | `src/simulation/maneuvers.ts` |
| GAME11 | One-click orbit circularization | `circularizeOrbit` + inspector |
| GAME12 | Rendezvous velocity matching | `matchVelocity` + inspector |
| GAME13 | Deterministic procedural star-system generator + preset | `src/simulation/presets/procedural-system.ts` |
| GAME14 | 8-challenge mission system with event triggers | `src/simulation/challenges.ts` |
| GAME15 | Challenge completion persistence across sessions | `challenges` localStorage |

### Backend (BACK01–BACK15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| BACK01 | Typed global event bus with history + unsubscribe | `src/core/event-bus.ts` |
| BACK02 | Structured logger with buffer, scopes, diagnostics export | `src/core/logger.ts` |
| BACK03 | Persisted planner settings store | `src/core/settings.ts` |
| BACK04 | Capability detection + FPS perf monitor with auto quality scaling | `src/core/capabilities.ts`, `perf-monitor.ts` |
| BACK05 | Schema migration pipeline (1.0.0 → 1.1.0) | `src/persistence/migrations.ts` |
| BACK06 | Project structure validation with pinpointed issues | `src/persistence/validation.ts` |
| BACK07 | IndexedDB autosave manager with status pill | `src/persistence/autosave.ts` |
| BACK08 | Versioned serializer + migrate-then-validate import pipeline | `serializer.ts`, `export-import.ts` |
| BACK09 | Forecast client: request coalescing, timeout + sync fallback | `src/simulation/future-client.ts` |
| BACK10 | Deterministic seeded RNG (mulberry32 + string hashing + forks) | `src/core/seeded-rng.ts` |
| BACK11 | Extended formatter suite (Δv, energy, mission clock, countdowns) | `src/simulation/units.ts` |
| BACK12 | Central tuning config (`PLANNER_CONFIG` + timescale ladder) | `src/core/config.ts` |
| BACK13 | 48 new tests: logic suites + component SSR smoke (77/77 green) | `src/tests/iteration1.test.ts`, `component-smoke.test.tsx` |
| BACK14 | Bundle budget gate + PWA artifact check in CI | `scripts/bundle-report.mjs`, `deploy.yml`, `npm run check` |
| BACK15 | Root error boundary + global error handlers | `src/ui/ErrorBoundary.tsx`, `main.tsx` |

### Validation

- `npx tsc --noEmit` — clean.
- `npm run test` — **77/77 pass** (29 pre-existing + 48 new).
- `npm run build` + `npm run bundle:report` — PASS (main 262.6 KB gzip vs 950 KB budget).
- Production preview served: `index.html`, main JS/CSS, manifest, service worker, all icons — HTTP 200.
- No browser available in sandbox; component coverage via SSR smoke suite (17 components).
- No regressions: all 5 pre-existing test files still green; pre-existing journeys untouched.

### Notes for next iteration

- Browser-based QA (grab-and-throw feel, loom sketching, S Pen) still needs a human/device pass.
- `velocity-arrow.ts` is currently consumed only by grab-and-throw; persistent per-body velocity vectors remain an option.
- Challenge roster could grow (eclipse photography, Lagrange parking, Grand Tour).

---

## Iteration 2 — 2026-09-13 — `improve: recursive project pass 2`

**Theme:** emergent depth — long-session systems (contracts, time-scrub,
project library, crash recovery), cinematic simulation feedback (slow-mo,
eclipse cones, warp streaks), and full App wiring for every new subsystem.

### UI (UI01–UI15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| UI01 | Command palette (`Ctrl+K`): fuzzy search over static + dynamic (per-body, per-branch) commands | `src/ui/CommandPalette.tsx`, `command-registry.ts`, `App` registration effects |
| UI02 | Body bookmarks: persisted shelf in navigator + chip star toggle | `settings.bookmarkedBodyIds`, `SystemNavigator`, `SelectionChip` |
| UI03 | Timeline history scrubber: 60-frame ring buffer + LIVE resume (undo-checkpointed) | `TimelineBar` scrub, `snapshot-buffer.ts`, `App.handleScrub` |
| UI04 | Branch-compare magnitude divergence: center-diverging delta bars | `BranchCompareModal` delta panel |
| UI05 | Ledger “Visit site” jump: event rows focus their body in 3D | `EventLedgerModal onFocusBody`, `App` wiring |
| UI06 | Navigator rewrite: hierarchy tree, ancestor-aware search, bookmarks shelf | `src/ui/SystemNavigator.tsx` |
| UI07 | Selection chip: bookmark control + live apsidal countdown (Periapsis T−) | `src/ui/SelectionChip.tsx` |
| UI08 | Settings v2 surface: overlay toggles, approach autopilot, metric/imperial units | `SettingsModal`, `PlannerSettings` schema v2 |
| UI09 | TopBar upgrade: health pill, project-library menu, palette button | `src/ui/TopBar.tsx` |
| UI10 | Inspector expansion: transfer planner, habitability, tidal lock, station-keeping, ephemeris export, copy-telemetry, imperial units | `src/ui/ContextInspector.tsx` |
| UI11 | Screen-reader announcer: selection/pause/collision/branch narration | `src/ui/Announcer.tsx`, `App` announce sites |
| UI12 | Create-body SpawnPreview: live period/equilibrium/HZ verdict while authoring | `CreateBodyModal` SpawnPreview |
| UI13 | Contextual coachmarks (grab/loom/fork/macro/transfer) with persisted dismissal | `src/ui/Coachmark.tsx`, `coachmarks.ts` |
| UI14 | New shortcuts: `Ctrl+K` palette + `P` showcase capture, registered + dispatched | `src/ui/shortcuts.ts`, `ShortcutsModal` |
| UI15 | PRESENT mode: chrome-free showcase canvas with PNG capture overlay | `AppMode PRESENT`, `present-overlay`, `captureScreenshot` |

### Assets / rendering (ASSET01–ASSET15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| ASSET01 | M-dwarf stochastic flare cycle (seeded RNG, per-star cooldowns) | `scene-manager` flare maps |
| ASSET02 | Black-hole relativistic jet shafts tracking horizon scale | `scene-manager` jet scaling |
| ASSET03 | Station construction kits (docking arms + beacons) for station bodies | `src/rendering/station-kit.ts` |
| ASSET04 | Ring shader upgrade: radial-UV band maps + per-ring seed variation | `celestial-shaders` `uBandMap`/`uSeed` |
| ASSET05 | Maneuver burn flash: azure burst at the burned body | `scene-manager.spawnBurnFlash`, `afterManeuverSync` |
| ASSET06 | Expanding shockwave rings on burns (reduced-motion gated, pooled ≤8) | `scene-manager` shockwaves |
| ASSET07 | Modal open/close micro-sounds + rate-limited UI feedback (90 ms floor) | `audio-synth` micro set, `modal-a11y` |
| ASSET08 | Ambience drone reacting to time acceleration (log-scaled intensity) | `setAmbienceIntensity`, frame-loop driver |
| ASSET09 | Eclipse shadow cones rendered on discovery events | `eclipse-cones.ts`, `discovery:eclipse` bus flow |
| ASSET10 | Procedural comet tails inside activity radius above eccentricity floor | `src/rendering/comet-tails.ts` |
| ASSET11 | Persistent collision-debris particle sync from engine state | `scene-manager.syncDebris`, frame loop |
| ASSET12 | Per-body velocity-vector overlay (settings toggle) | `setVelocityVectorsVisible` + settings |
| ASSET13 | AU measurement ruler overlay (settings toggle) | `setAuRulerVisible` + settings |
| ASSET14 | Warp-streak overlay at high time acceleration | `src/ui/WarpStreaks.tsx` |
| ASSET15 | Orbit-line + body-label visibility toggles plumbed to settings | `setOrbitLinesVisible`, `setLabelsVisible` |

### Gameplay / simulation (GAME01–GAME15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| GAME01 | Hohmann transfer planner: Δv1/Δv2/coast/total + one-click departure burn | `transfer-planner.ts`, inspector Transfers |
| GAME02 | Habitability verdicts: 0–100 score + factor breakdown per world | `habitability.ts`, inspector section |
| GAME03 | Tidal-lock timescale estimates for bound orbiters | `tidal-locking.ts`, inspector line |
| GAME04 | Station-keeping: engine thrust enforcement + per-body toggle | `engine` GAME11 pass, `handleToggleStationKeeping` |
| GAME05 | Gravity-assist meter: measured slingshot Δv celebrated in ledger + toast | `gravity-assists.ts`, `assist:measured` flow |
| GAME06 | Gravitational capture detection (unbound → bound) with bus event | `event-monitor` capture, `orbit:captured` |
| GAME07 | Eclipse/transit/conjunction detection with cooldown caches | `event-monitor` syzygy pipeline |
| GAME08 | Mean-motion resonance + syzygy-chain detection (one-shot per pair) | `syzygy.ts`, monitor resonance cache |
| GAME09 | Scenario contracts: Harbor Light, Resonance Architect, Comet Shepherd (persisted) | `contracts.ts`, `MissionsPanel` contracts |
| GAME10 | Forecast-driven manual merge: fuse doomed pairs from the banner (undoable) | `mergeBodiesInelastic`, MERGE NOW |
| GAME11 | Approach autopilot: auto-throttle near imminent impact or periapsis | frame-loop autopilot + settings |
| GAME12 | Mission roster doubled 8 → 16 (eclipse, Hohmann, comet, steward, scholar…) | `CHALLENGE_DEFINITIONS` |
| GAME13 | L4/L5-gated Lagrange-parker win condition (60° Trojan parking check) | `challenges.ts` gate |
| GAME14 | Timeline divergence tags: live % drift per branch in the switcher | `divergencePercent`, `TimelineBar` |
| GAME15 | Catastrophe slow-motion: 10× dilation for 2.5 s on collision | `collision:occurred` slow-mo flow |

### Backend (BACK01–BACK15)

| ID | Improvement | Evidence |
|----|-------------|----------|
| BACK01 | Bus growth: 14 new typed events (orbit/transfer/merge/discovery/assist/contract/library/PWA/recovery/ephemeris) | `src/core/event-bus.ts` |
| BACK02 | Snapshot ring buffer: interval-gated, capacity-bounded, restorable | `src/simulation/snapshot-buffer.ts` |
| BACK03 | Project library: named IndexedDB slots beyond the autosave (save/open/delete) | `project-library.ts`, TopBar menu |
| BACK04 | Forecast-response cache keyed by originating request hash (hit/miss stats) | `future-client` `lastRequestKey` |
| BACK05 | Settings schema v2 + migration (bookmarks, overlays, autopilot, units) | `src/core/settings.ts` |
| BACK06 | `createId` unique ids replace all `Date.now()` identity (bursts, macros, maneuvers) | `src/core/id.ts`, App + engine |
| BACK07 | `PlannerError` taxonomy + fault-screen error codes + `toUserMessage` | `src/core/errors.ts`, `ErrorBoundary` |
| BACK08 | Crash-recovery sentinel: dirty flag + boot-time autosave offer | `src/core/recovery.ts`, `main.tsx` |
| BACK09 | Perf telemetry: longtask observer, frame histograms, budget tracking | `perf-monitor`, `observeLongTasks` |
| BACK10 | GPU-memory hygiene: texture LRU-96 + disposal registry in diagnostics | `planet-textures`, `rendering/disposal` |
| BACK11 | Typed persistence failures (`PERSIST_READ`/`PERSIST_WRITE`) with safe copy | `src/persistence/db.ts` |
| BACK12 | Ephemeris sampler: N-body propagation → timestamped CSV export | `src/simulation/ephemeris.ts` |
| BACK13 | PWA prompt-mode updates + offline fallback page | `vite.config` VitePWA, `offline.html` |
| BACK14 | Clean shutdown (beforeunload) + update-available bus signal with reload toast | `src/main.tsx`, `pwa:update-available` |
| BACK15 | Engine tick stats: per-subsystem ms + substep counts for diagnostics | `engine.lastTickStats` |

### Validation

- `npx tsc --noEmit` — clean (whole project, incl. `App.tsx`).
- `npm run test` — **95/95 pass** (77 pre-existing + 18 new in `iteration2.test.ts`).
- `npm run build` — PASS (PWA precache 12 entries; chunk-size warning only, pre-existing).
- Production preview served over sandbox proxy: `index.html` + main bundle + SW — HTTP 200; bundle contains MERGE NOW, present-overlay, palette, scrub, contract/capture flows.
- `vite.config` gains `preview.allowedHosts` for sandbox proxy (dev-only effect).
- No regressions: all 7 pre-existing test files still green; iteration-1 journeys untouched.

### Notes for next iteration

- Browser-feel QA (loom sketching, grab throws, S Pen) still needs a human/device pass.
- Contract roster could grow (Grand Tour, Trojan shepherd, heliocide witness).
- Assist “best of session” is tracked but not yet surfaced in a debrief surface.
- Snapshot buffer covers bodies only; belts/routes stay live during scrub by design.
