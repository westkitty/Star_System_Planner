# Map of the All — verification evidence

**Observed 2026-10-17.** Runtime: authorized Big Mac, macOS ARM64, Node 26.12, Brave/Chromium headless (native WebGL path). Work performed in an isolated temporary clone of westkitty/Star_System_Planner's feature branch. No canonical Dossier files were changed.

## Reproducible checks

From the repository root:

```bash
npm ci
node --test map-of-the-all/tests/atlas-data.node-check.mjs
npm run typecheck
npm run test
npm run build
npm run bundle:report
npm run preview
```

Navigate to the Atlas path printed under the preview server's base URL, normally http://127.0.0.1:4173/Star_System_Planner/map-of-the-all/.

## Evidence-observed results

| Surface | Observed outcome |
| --- | --- |
| Atlas Node checks | 10 invariants / markup regressions pass, including import demotion, protected concept source links, valid geography types and fractional editor inputs |
| Existing planner | 230 Vitest tests pass; TypeScript check passes |
| Build | Vite compiles the original and new Atlas HTML entries; size/PWA gate passes |
| Desktop browser 1536×864 | 10 projected labels visible, nine top-tier selectable objects, all 11 layer controls; WebGL scene initializes |
| Layer & editor | Typography disappears/reappears on toggle; rename updates DOM and persists after page reload |
| Navigation & authoring | All → galaxy (5 systems) → system (3 starter planets); create and rename planet; create annotation |
| Export | Download event produces versioned JSON draft |
| Parent preservation | Original /Star_System_Planner/ route responds HTTP 200 |
| Browser errors | No uncaught page errors or HTTP 4xx/5xx responses observed in passing desktop run |
| Touch emulation | 1280×800 and 412×915: no horizontal overflow or page errors; inspector closes on phone; unselected editor hidden |

## Defects identified and corrected

1. Render-loop-driven labels did not disappear immediately on layer toggles. Scene rebuild now refreshes label projection immediately.
2. An over-bright trial starfield saturated white. Galaxy textures now use procedural spiral-disc shaders and softer GPU particle stars; visual comparison was inspected in browser.
3. Browser number inputs used fractional-incompatible step restrictions; numeric coordinate and size editors now accept any valid decimal in their bounds.
4. CSS display rules incorrectly overrode the HTML hidden form attribute. A universal hidden override restores correct empty-selection state.
5. The mobile inspector could open but had no touch-accessible close control. The dedicated close button is exercised in emulated mobile QA.

## Explicit limits

- Emulator dimensions and touch support are not physical Tab S9 Ultra/S Pen proof. Stylus hover/pressure, thermal throttling and frame-rate budgets on real devices remain unknown.
- Passing parent unit tests and HTTP 200 do not prove every existing planner interaction.
- Browser screenshot/QA is not the same as production GitHub Pages byte parity. The feature branch is independent; Pages currently builds from main.
- Map coordinates, metric distances, territorial boundaries, route geometry and pictured epochs remain provisional. The WorldsVault reference proves **topology**, not a spatial atlas.
- No physical device memory-leak soak, accessibility screen-reader walk, maximal import stress or context-loss recovery was performed.

**Verdict:** browser prototype verified on the observed development machine and two touch-emulated viewports. Production deployment and physical-device performance remain unverified.
