/**
 * Bundle-size reporter + budget gate (BACK14).
 *
 * Runs after `vite build`, prints a per-asset table with gzip estimates,
 * and fails CI when the main JS bundle or total dist footprint regresses
 * beyond budget. Keeps the tablet-first PWA lean by construction.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;
const MAIN_JS_BUDGET_KB = 950; // gzip KB
const TOTAL_BUDGET_KB = 1400; // gzip KB (excludes service-worker precache)

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function kb(bytes) {
  return bytes / 1024;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error('[bundle-report] dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const rows = files
  .map((full) => {
    const raw = readFileSync(full);
    return {
      file: relative(DIST, full),
      rawKb: kb(raw.length),
      gzipKb: kb(gzipSync(raw).length),
    };
  })
  .sort((a, b) => b.gzipKb - a.gzipKb);

console.log('\n[bundle-report] Production footprint (top 15 by gzip size)');
console.log('  file                                          raw        gzip');
console.log('  ──────────────────────────────────────────────────────────────');
for (const row of rows.slice(0, 15)) {
  console.log(
    `  ${row.file.padEnd(42).slice(0, 42)} ${row.rawKb.toFixed(1).padStart(8)} KB ${row.gzipKb.toFixed(1).padStart(8)} KB`
  );
}

const mainJs = rows.find((r) => r.file.startsWith('assets/') && r.file.endsWith('.js'));
const totalGzip = rows
  .filter((r) => !r.file.startsWith('workbox-') && r.file !== 'sw.js')
  .reduce((sum, r) => sum + r.gzipKb, 0);

console.log('  ──────────────────────────────────────────────────────────────');
console.log(`  main bundle gzip: ${(mainJs?.gzipKb ?? 0).toFixed(1)} KB (budget ${MAIN_JS_BUDGET_KB} KB)`);
console.log(`  total dist gzip:  ${totalGzip.toFixed(1)} KB (budget ${TOTAL_BUDGET_KB} KB)`);

let failed = false;
if ((mainJs?.gzipKb ?? 0) > MAIN_JS_BUDGET_KB) {
  console.error('[bundle-report] FAIL: main bundle exceeds gzip budget.');
  failed = true;
}
if (totalGzip > TOTAL_BUDGET_KB) {
  console.error('[bundle-report] FAIL: total dist footprint exceeds gzip budget.');
  failed = true;
}

// PWA integrity: manifest + service worker + icons must ship.
const names = new Set(rows.map((r) => r.file));
for (const required of ['manifest.webmanifest', 'sw.js', 'favicon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg']) {
  if (!names.has(required)) {
    console.error(`[bundle-report] FAIL: missing PWA artifact "${required}".`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('[bundle-report] PASS: budgets and PWA artifacts verified.\n');
