delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

// 1. Static file server for dist/
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function createStaticServer() {
  return http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    console.log(`[HTTP Req] ${req.method} ${reqPath}`);
    if (reqPath.startsWith('/Star_System_Planner/')) {
      reqPath = reqPath.slice('/Star_System_Planner/'.length);
    } else if (reqPath === '/Star_System_Planner') {
      reqPath = '';
    }
    if (reqPath === '' || reqPath === '/') {
      reqPath = 'index.html';
    }

    const filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (!reqPath.endsWith('.js') && !reqPath.endsWith('.css')) {
        const indexPath = path.join(distDir, 'index.html');
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }
      console.warn(`[HTTP 404] ${filePath}`);
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// CDP Client Helper
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const cb = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) cb.reject(new Error(data.error.message || JSON.stringify(data.error)));
          else cb.resolve(data.result);
        } else if (data.method) {
          const listeners = this.eventListeners.get(data.method) || [];
          for (const l of listeners) l(data.params);
        }
      };
    });
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(handler);
  }

  send(method, params = {}, sessionId = undefined) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.callbacks.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  async evaluate(expression, sessionId) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function runBrowserValidation() {
  console.log('=== STARSILK SYSTEM PLANNER: REAL BROWSER VALIDATION ===');

  // 1. Start HTTP Server
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/Star_System_Planner/`;
  console.log(`[HTTP] Local preview server running at ${baseUrl}`);

  // 2. Launch Chrome Headless
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ssp-test-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--window-size=1280,800',
    '--user-data-dir=' + tmpUserDataDir,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let wsUrl = null;
  const wsPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for DevTools URL')), 10000);
    chrome.stderr.on('data', (d) => {
      const text = d.toString();
      const m = text.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
      if (m) {
        clearTimeout(timeout);
        resolve(m[1]);
      }
    });
  });

  wsUrl = await wsPromise;
  console.log(`[Chrome] Browser launched, CDP: ${wsUrl}`);

  const client = new CDPClient(wsUrl);
  await client.connect();

  client.on('Runtime.consoleAPICalled', (params) => {
    console.log('[Browser Console]', params.type, params.args.map((a) => a.value ?? a.description).join(' '));
  });
  client.on('Runtime.exceptionThrown', (params) => {
    console.error('[Browser Exception]', params.exceptionDetails.text, params.exceptionDetails.exception?.description);
  });

  // Create or attach to page target
  const targets = await client.send('Target.getTargets');
  let pageTarget = targets.targetInfos.find((t) => t.type === 'page');
  if (!pageTarget) {
    const created = await client.send('Target.createTarget', { url: 'about:blank' });
    pageTarget = { targetId: created.targetId };
  }

  const session = await client.send('Target.attachToTarget', {
    targetId: pageTarget.targetId,
    flatten: true,
  });
  const sid = session.sessionId;

  await client.send('Page.enable', {}, sid);
  await client.send('Runtime.enable', {}, sid);
  await client.send('DOM.enable', {}, sid);

  // Navigate to app
  console.log(`[Nav] Navigating to ${baseUrl}...`);
  await client.send('Page.navigate', { url: baseUrl }, sid);

  // Wait for React mount and canvas
  console.log('[Wait] Waiting for universe-canvas mount...');
  let mounted = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const hasCanvas = await client.evaluate(`!!document.querySelector('canvas.universe-canvas')`, sid);
      if (hasCanvas) {
        mounted = true;
        break;
      }
    } catch {}
  }
  if (!mounted) throw new Error('Canvas failed to mount within 15 seconds.');
  console.log('[Mount] Canvas successfully mounted and running in Chrome!');

  // Check initial viewport metrics at 1280x800
  const dimensions = await client.evaluate(`({
    width: window.innerWidth,
    height: window.innerHeight,
    canvasW: document.querySelector('canvas.universe-canvas').clientWidth,
    canvasH: document.querySelector('canvas.universe-canvas').clientHeight,
    topBarVisible: !!document.querySelector('.top-bar'),
    toolRailVisible: !!document.querySelector('.left-tool-rail'),
    timelineVisible: !!document.querySelector('.bottom-timeline-bar'),
  })`, sid);
  console.log('[Viewport 1280x800 Metrics]', dimensions);

  const results = {
    journey1_orbit_loom: false,
    journey2_tool_switching: false,
    journey3_touch_loom: false,
    journey4_canon_lab: false,
    journey5_flight_director: false,
  };

  // ==========================================
  // JOURNEY 2 — TOOL SWITCHING
  // Sequence: SELECT -> LOOM -> SELECT -> GRAB -> SELECT -> LOOM
  // ==========================================
  console.log('\n--- EXERCISING JOURNEY 2: LIVE TOOL SWITCHING ---');
  const sequence = ['select', 'orbit_loom', 'select', 'grab_throw', 'select', 'orbit_loom'];
  const labels = {
    select: 'SELECT',
    orbit_loom: 'LOOM',
    grab_throw: 'GRAB',
  };

  let toolSwitchSuccess = true;
  for (const tool of sequence) {
    const label = labels[tool];
    const clickRes = await client.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.left-tool-rail .tool-button'));
        const target = btns.find(b => b.textContent.includes('${label}'));
        if (!target) return { found: false };
        target.click();
        return { found: true };
      })()
    `, sid);
    await new Promise((r) => setTimeout(r, 150));
    const activeText = await client.evaluate(`
      document.querySelector('.left-tool-rail .tool-button.active')?.textContent || ''
    `, sid);
    console.log(`  Switched to ${label} -> active button is: "${activeText.trim()}"`);
    if (!activeText.includes(label)) {
      toolSwitchSuccess = false;
      break;
    }
  }
  results.journey2_tool_switching = toolSwitchSuccess;
  console.log('Journey 2 Status:', results.journey2_tool_switching ? 'PASS' : 'FAIL');

  // ==========================================
  // JOURNEY 3 — TOUCH WHILE LOOM ACTIVE
  // Confirm touch input navigates and does NOT create orbit stroke
  // ==========================================
  console.log('\n--- EXERCISING JOURNEY 3: TOUCH INPUT IN ORBIT LOOM ---');
  // Ensure LOOM is active
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.left-tool-rail .tool-button'));
      const loomBtn = btns.find(b => b.textContent.includes('LOOM'));
      loomBtn?.click();
    })()
  `, sid);

  // Simulate touch down, move (drag), up on the canvas
  const touchRes = await client.evaluate(`
    (() => {
      const canvas = document.querySelector('canvas.universe-canvas');
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Dispatch single-finger touch
      const downEv = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        pointerType: 'touch',
        pointerId: 10,
        buttons: 1,
      });
      canvas.dispatchEvent(downEv);

      const moveEv = new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: cx + 100,
        clientY: cy + 100,
        pointerType: 'touch',
        pointerId: 10,
        buttons: 1,
      });
      canvas.dispatchEvent(moveEv);

      const upEv = new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: cx + 100,
        clientY: cy + 100,
        pointerType: 'touch',
        pointerId: 10,
        buttons: 0,
      });
      canvas.dispatchEvent(upEv);

      // Verify no orbit modal appeared
      const hasModal = !!document.querySelector('.orbit-loom-confirm-modal');
      return {
        touchDispatched: true,
        hasModal,
      };
    })()
  `, sid);
  console.log('  Touch simulation result:', touchRes);
  results.journey3_touch_loom = touchRes.touchDispatched && !touchRes.hasModal;
  console.log('Journey 3 Status:', results.journey3_touch_loom ? 'PASS' : 'FAIL');

  // ==========================================
  // JOURNEY 1 — ORBIT LOOM DRAW & APPLY
  // Pen / Mouse drawing creates stroke -> confirmation modal -> apply to body
  // ==========================================
  console.log('\n--- EXERCISING JOURNEY 1: ORBIT LOOM DRAWING & CONFIRMATION ---');
  // 1. Ensure LOOM tool is selected and active
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.left-tool-rail .tool-button'));
      const loomBtn = btns.find(b => b.textContent.includes('LOOM'));
      loomBtn?.click();
    })()
  `, sid);
  await new Promise((r) => setTimeout(r, 200));

  // Dispatch mouse/pen circular stroke to fit an orbit
  const drawRes = await client.evaluate(`
    (() => {
      const canvas = document.querySelector('canvas.universe-canvas');
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = Math.min(rect.width, rect.height) * 0.28;

      const activeBtn = document.querySelector('.left-tool-rail .tool-button.active')?.textContent || '';

      // Start stroke with pen / mouse
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: cx + radius,
        clientY: cy,
        pointerType: 'pen',
        pointerId: 2,
        buttons: 1,
      }));

      // Draw 32 points along an ellipse
      const numPoints = 32;
      for (let i = 1; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * (radius * 0.75);
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: px,
          clientY: py,
          pointerType: 'pen',
          pointerId: 2,
          buttons: 1,
        }));
      }

      // End stroke
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: cx + radius,
        clientY: cy,
        pointerType: 'pen',
        pointerId: 2,
        buttons: 0,
      }));

      return {
        activeBtn,
        strokeCompleted: true,
      };
    })()
  `, sid);
  console.log('  Drawing stroke dispatched:', drawRes);

  // Wait for Orbit Loom confirmation modal to appear in DOM
  let modalFound = false;
  let appliedSuccess = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const checkModal = await client.evaluate(`
      (() => {
        const modal = Array.from(document.querySelectorAll('div')).find(d => 
          d.textContent && d.textContent.includes('ORBIT LOOM — CONIC FIT CONFIRMATION')
        );
        const applyBtn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent && (b.textContent.includes('APPLY TO') || b.textContent.includes('CREATE ORBITAL RING'))
        );
        const selectElem = document.querySelector('select');
        return {
          hasModal: !!modal,
          hasApplyBtn: !!applyBtn,
          hasSelect: !!selectElem && selectElem.options.length > 1,
          modalSnippet: modal ? modal.textContent.slice(0, 80) : null
        };
      })()
    `, sid);

    if (checkModal.hasModal && (checkModal.hasApplyBtn || checkModal.hasSelect)) {
      modalFound = true;
      console.log('  Modal appeared:', checkModal.modalSnippet);
      
      // Apply orbit using dropdown or button
      const applyRes = await client.evaluate(`
        (() => {
          const selectElem = document.querySelector('select');
          if (selectElem && selectElem.options.length > 1) {
            selectElem.value = selectElem.options[1].value;
            selectElem.dispatchEvent(new Event('change', { bubbles: true }));
            return { appliedVia: 'select', target: selectElem.options[1].text };
          }
          const ringBtn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent && b.textContent.includes('CREATE ORBITAL RING')
          );
          if (ringBtn) {
            ringBtn.click();
            return { appliedVia: 'ringBtn' };
          }
          return { appliedVia: 'none' };
        })()
      `, sid);
      console.log('  Orbit applied:', applyRes);
      appliedSuccess = applyRes.appliedVia !== 'none';
      break;
    }
  }

  // Check event ledger for orbit event
  await new Promise((r) => setTimeout(r, 400));
  const ledgerCheck = await client.evaluate(`
    (() => {
      const badge = document.querySelector('.timeline-events-badge');
      return {
        badgeText: badge ? badge.textContent : null,
      };
    })()
  `, sid);
  console.log('  Ledger event badge:', ledgerCheck);

  results.journey1_orbit_loom = modalFound && appliedSuccess;
  console.log('Journey 1 Status:', results.journey1_orbit_loom ? 'PASS' : 'FAIL');

  // ==========================================
  // JOURNEY 4 — CANON LAB MODAL
  // Verify honest labels, source/planner distinction, hold-to-confirm, no Kerr/harmonic wording
  // ==========================================
  console.log('\n--- EXERCISING JOURNEY 4: CANON LAB MODAL INTEGRITY ---');

  // First select star by clicking center canvas or using select tool
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.left-tool-rail .tool-button'));
      const selectBtn = btns.find(b => b.textContent.includes('SELECT'));
      selectBtn?.click();

      const canvas = document.querySelector('canvas.universe-canvas');
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Click center where star sits
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        pointerType: 'mouse',
        buttons: 1,
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        pointerType: 'mouse',
        buttons: 0,
      }));
    })()
  `, sid);
  await new Promise((r) => setTimeout(r, 300));

  // Open Canon Lab
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.left-tool-rail .tool-button'));
      const canonBtn = btns.find(b => b.textContent.includes('CANON'));
      canonBtn?.click();
    })()
  `, sid);

  await new Promise((r) => setTimeout(r, 500));
  const canonLabAudit = await client.evaluate(`
    (() => {
      const text = document.body.innerText;
      
      const hasTitle = text.includes('STARSILK CANON LAB') || text.includes('CANON LAB');
      const hasClassification = text.includes('DIRECT SOURCE CANON') || text.includes('SOURCE CANON') || text.includes('CANON-INSPIRED');
      const hasHoldToConfirm = text.includes('HOLD') || text.includes('Hold') || !!document.querySelector('.macro-hold-button');
      
      // Prohibited terms
      const hasKerr = /\\bkerr\\b/i.test(text);
      const hasHarmonicTension = /harmonic tension/i.test(text);
      const hasGravitationalSiphoning = /gravitational siphoning/i.test(text);

      return {
        hasTitle,
        hasClassification,
        hasHoldToConfirm,
        hasKerr,
        hasHarmonicTension,
        hasGravitationalSiphoning,
      };
    })()
  `, sid);
  console.log('  Canon Lab Audit:', canonLabAudit);

  results.journey4_canon_lab = 
    canonLabAudit.hasTitle && 
    canonLabAudit.hasClassification && 
    canonLabAudit.hasHoldToConfirm &&
    !canonLabAudit.hasKerr && 
    !canonLabAudit.hasHarmonicTension && 
    !canonLabAudit.hasGravitationalSiphoning;
  console.log('Journey 4 Status:', results.journey4_canon_lab ? 'PASS' : 'FAIL');

  // Close Canon Lab through its actual backdrop contract, then verify teardown.
  await client.evaluate(`
    (() => {
      const modal = document.querySelector('.canon-lab-modal');
      const backdrop = modal?.parentElement;
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()
  `, sid);
  await new Promise((r) => setTimeout(r, 200));

  // ==========================================
  // JOURNEY 5 — FLIGHT DIRECTOR + GHOST PREVIEW + NARROW LAYOUT
  // ==========================================
  console.log('\n--- EXERCISING JOURNEY 5: FLIGHT DIRECTOR GHOST PREVIEW ---');
  for (let i = 0; i < 3; i++) {
    const modalOpen = await client.evaluate(`!!document.querySelector('.modal-backdrop')`, sid);
    if (!modalOpen) break;
    await client.evaluate(`document.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`, sid);
    await new Promise((r) => setTimeout(r, 120));
  }
  await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))`, sid);
  await new Promise((r) => setTimeout(r, 200));
  const selectedForDirector = await client.evaluate(`
    (() => {
      const rows = Array.from(document.querySelectorAll('.navigator-row'));
      const row = rows.find((candidate) => candidate.querySelector('.navigator-name')?.textContent?.includes('Aegis Orbital Complex'));
      if (!row) return false;
      row.click();
      return true;
    })()
  `, sid);
  const launcherClicked = await client.evaluate(`(() => { const button = document.querySelector('[aria-label=\"Toggle Flight Director\"]'); button?.click(); return !!button; })()`, sid);
  await new Promise((r) => setTimeout(r, 250));
  const directorOpen = await client.evaluate(`!!document.querySelector('.flight-director-panel')`, sid);
  const addImpulse = await client.evaluate(`
    (() => {
      const button = Array.from(document.querySelectorAll('.flight-director-panel button')).find((b) => b.textContent.includes('ADD IMPULSE'));
      button?.click();
      return !!button;
    })()
  `, sid);
  await new Promise((r) => setTimeout(r, 150));
  const previewStarted = await client.evaluate(`
    (() => {
      const button = Array.from(document.querySelectorAll('.flight-director-panel button')).find((b) => b.textContent.includes('PREVIEW PLAN PATH'));
      button?.click();
      return !!button;
    })()
  `, sid);
  let previewReady = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    previewReady = await client.evaluate(`!!document.querySelector('.director-preview-result.ready')`, sid);
    if (previewReady) break;
  }
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sid);
  await new Promise((r) => setTimeout(r, 200));
  const narrowAudit = await client.evaluate(`
    (() => {
      const panel = document.querySelector('.flight-director-panel');
      if (!panel) return { panel: false };
      const rect = panel.getBoundingClientRect();
      const primary = panel.querySelector('.director-primary-action');
      return {
        panel: true,
        width: Math.round(rect.width),
        bottom: Math.round(window.innerHeight - rect.bottom),
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        primaryMinHeight: primary ? parseFloat(getComputedStyle(primary).minHeight) : 0,
      };
    })()
  `, sid);
  console.log('  Flight Director runtime:', { selectedForDirector, launcherClicked, directorOpen, addImpulse, previewStarted, previewReady, narrowAudit });
  results.journey5_flight_director = Boolean(selectedForDirector && launcherClicked && directorOpen && addImpulse && previewStarted && previewReady && narrowAudit.panel && narrowAudit.width <= 390 && narrowAudit.bottom <= 1 && narrowAudit.noHorizontalOverflow && narrowAudit.primaryMinHeight >= 44);
  console.log('Journey 5 Status:', results.journey5_flight_director ? 'PASS' : 'FAIL');
  await client.send('Emulation.clearDeviceMetricsOverride', {}, sid);

  // Final Screenshot for evidence
  const screenshotData = await client.send('Page.captureScreenshot', { format: 'png' }, sid);
  const ssPath = path.resolve(__dirname, '../browser-qa-evidence.png');
  fs.writeFileSync(ssPath, Buffer.from(screenshotData.data, 'base64'));
  console.log(`[Screenshot] Evidence saved to ${ssPath} (${screenshotData.data.length} b64 chars)`);

  // Teardown
  client.ws.close();
  chrome.kill();
  server.close();
  try {
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=== REAL BROWSER VALIDATION SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));

  const allPassed = Object.values(results).every(Boolean);
  if (!allPassed) {
    console.error('One or more journeys failed!');
    process.exit(1);
  }
  console.log('\nALL CRITICAL BROWSER JOURNEYS PASSED CLEANLY!\n');
  process.exit(0);
}

runBrowserValidation().catch((err) => {
  console.error('Browser QA error:', err);
  process.exit(1);
});
