/**
 * Scripts/refresh-canon.mjs
 * 
 * Fetches public, source-backed Starsilk machine records from the read-only Dossier
 * and writes a compact planner-relevant local snapshot to src/canon/snapshot/canon-manifest.json.
 * 
 * Invariants:
 * - Does NOT mutate canon authority.
 * - Leaves unknown fields explicitly unknown.
 * - Fails gracefully if offline, keeping existing snapshot.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'src', 'canon', 'snapshot', 'canon-manifest.json');

const BASE_URL = 'https://westkitty.github.io/Starsilk_Character_Dossier';

const TARGET_ENDPOINTS = {
  canonLocks: `${BASE_URL}/canon/canon-locks.json`,
  worldsvault: `${BASE_URL}/worldsvault/worldsvault.json`,
  starsilkMaterial: `${BASE_URL}/machine/entities/starsilk-material.json`,
  cosmicArchitecture: `${BASE_URL}/machine/entities/cosmic-architecture.json`,
  systems: `${BASE_URL}/machine/entities/systems.json`,
  worldsvaultTemplates: `${BASE_URL}/machine/entities/worldsvault-templates.json`,
};

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'StarsilkSystemPlanner-CanonPipeline/1.0' } });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
  }
  return resp.json();
}

function validateRequiredFields(payloads) {
  const { canonLocks, worldsvault, starsilkMaterial, cosmicArchitecture, systems, worldsvaultTemplates } = payloads;

  if (!canonLocks || !Array.isArray(canonLocks.locks)) {
    throw new Error('Required-field structural validation failed: canonLocks missing locks array');
  }
  if (!worldsvault || typeof worldsvault.node_count !== 'number' || !Array.isArray(worldsvault.nodes)) {
    throw new Error('Required-field structural validation failed: worldsvault missing node_count or nodes array');
  }
  if (!starsilkMaterial || typeof starsilkMaterial.canonical_url !== 'string') {
    throw new Error('Required-field structural validation failed: starsilkMaterial missing canonical_url');
  }
  if (!cosmicArchitecture || typeof cosmicArchitecture.canonical_url !== 'string') {
    throw new Error('Required-field structural validation failed: cosmicArchitecture missing canonical_url');
  }
  if (!systems || typeof systems.canonical_url !== 'string') {
    throw new Error('Required-field structural validation failed: systems missing canonical_url');
  }
  if (!worldsvaultTemplates || typeof worldsvaultTemplates.canonical_url !== 'string') {
    throw new Error('Required-field structural validation failed: worldsvaultTemplates missing canonical_url');
  }
}

async function run() {
  console.log('[Canon Refresh] Starting planner-relevant source sync from:', BASE_URL);

  let existingSnapshot = null;
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingSnapshot = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch {
      // ignore
    }
  }

  try {
    const [
      canonLocks,
      worldsvault,
      starsilkMaterial,
      cosmicArchitecture,
      systems,
      worldsvaultTemplates,
    ] = await Promise.all([
      fetchJson(TARGET_ENDPOINTS.canonLocks),
      fetchJson(TARGET_ENDPOINTS.worldsvault),
      fetchJson(TARGET_ENDPOINTS.starsilkMaterial),
      fetchJson(TARGET_ENDPOINTS.cosmicArchitecture),
      fetchJson(TARGET_ENDPOINTS.systems),
      fetchJson(TARGET_ENDPOINTS.worldsvaultTemplates),
    ]);

    // Perform required-field structural validation on fetched payloads
    validateRequiredFields({
      canonLocks,
      worldsvault,
      starsilkMaterial,
      cosmicArchitecture,
      systems,
      worldsvaultTemplates,
    });
    console.log('[Canon Refresh] Passed required-field structural validation.');

    const manifest = {
      schemaVersion: '1.0.0',
      retrievedAt: new Date().toISOString(),
      sourceBaseUrl: BASE_URL,
      authorityNotice: 'Public machine derivative snapshot for Starsilk System Planner. External Compendium remains sole canon authority. Generated planner systems do not become canon.',
      provenanceNotice: 'Source Dossier records are preserved under sourceRecord; planner-maintained interpretations, palette selections, and pedagogical summaries are explicitly grouped under plannerSummary.',
      locks: {
        bloodEclipseDurationYears: 170,
        starsilkMaterialAzure: true,
        wordstreamerSpelling: 'Wordstreamer',
        singleTailTiger: true,
        prohibitions: ['no-william'],
        summary: canonLocks.locks?.map(l => ({
          lockId: l.lock_id,
          description: l.description,
          scope: l.scope,
          stableId: l.target?.stable_id ?? null,
        })) ?? [],
      },
      worldsvaultTopology: {
        nodeCount: worldsvault.node_count,
        edgeCount: worldsvault.edge_count,
        nodes: worldsvault.nodes?.map(n => ({
          nodeId: n.node_id,
          label: n.label,
          nodeClass: n.node_class,
          identityStatus: n.identity_status,
          sourceUrl: n.canonical_url,
          stableId: n.source?.stable_id,
          unknowns: n.unknowns,
        })) ?? [],
        edges: worldsvault.edges?.map(e => ({
          edgeId: e.edge_id,
          source: e.source,
          target: e.target,
          relation: e.relation,
          relationClass: e.relation_class,
          unknowns: e.unknowns,
        })) ?? [],
        unknowns: worldsvault.unknowns ?? [],
      },
      entities: {
        starsilkMaterial: {
          sourceRecord: {
            stableId: 'starsilk-material',
            canonicalUrl: starsilkMaterial.canonical_url,
            sourceRef: 'src/content/sections/starsilk-material.body.html',
          },
          plannerSummary: {
            palette: ['#03050A', '#07131E', '#0A2A44', '#0CC6FF', '#49E7FF', '#B6F6FF'],
            canonicalNature: [
              'Literal programmable cosmological substance and medium for repeatable reality Macros.',
              'Macros are repeatable action-loops embedded into the universe, not metaphorical magic.',
              'Starsilk itself is not sentient or sapient.',
              'Death remains final. Starlight and Starsilk may retain data or residue without conscious afterlife.',
              'Star-dive pull causes irreversible stellar destabilization and black-hole collapse.'
            ],
          },
          stableId: 'starsilk-material',
          canonicalUrl: starsilkMaterial.canonical_url,
          palette: ['#03050A', '#07131E', '#0A2A44', '#0CC6FF', '#49E7FF', '#B6F6FF'],
          canonicalNature: [
            'Literal programmable cosmological substance and medium for repeatable reality Macros.',
            'Macros are repeatable action-loops embedded into the universe, not metaphorical magic.',
            'Starsilk itself is not sentient or sapient.',
            'Death remains final. Starlight and Starsilk may retain data or residue without conscious afterlife.',
            'Star-dive pull causes irreversible stellar destabilization and black-hole collapse.'
          ],
          sourceRef: 'src/content/sections/starsilk-material.body.html',
        },
        cosmicArchitecture: {
          sourceRecord: {
            stableId: 'cosmic-architecture',
            canonicalUrl: cosmicArchitecture.canonical_url,
          },
          plannerSummary: {
            structures: [
              { id: 'worlds-vault', name: 'WorldsVault', type: 'digital-geode', note: 'Oppressive digital geode lit by hyper-luminous azure edges. Stores thirty extinct planetary templates.' },
              { id: 'siege-wall', name: 'Siege Wall', type: 'black-hole-lattice', note: 'Physical view is starless black void absence, not glowing geometric grid.' },
              { id: 'meridian-station', name: 'Meridian Station', type: 'orbital-habitat', note: 'Industrial orbital habitat orbiting gas giant Virgil.' },
              { id: 'virgil', name: 'Virgil', type: 'gas-giant', note: 'Desaturated steel-blue and ash-gray gas giant orbited by Meridian.' }
            ],
            drakkenTheses: ['Pyric', 'Aqueous', 'Telluric', 'Aeric', 'Umbral'],
          },
          stableId: 'cosmic-architecture',
          canonicalUrl: cosmicArchitecture.canonical_url,
          structures: [
            { id: 'worlds-vault', name: 'WorldsVault', type: 'digital-geode', note: 'Oppressive digital geode lit by hyper-luminous azure edges. Stores thirty extinct planetary templates.' },
            { id: 'siege-wall', name: 'Siege Wall', type: 'black-hole-lattice', note: 'Physical view is starless black void absence, not glowing geometric grid.' },
            { id: 'meridian-station', name: 'Meridian Station', type: 'orbital-habitat', note: 'Industrial orbital habitat orbiting gas giant Virgil.' },
            { id: 'virgil', name: 'Virgil', type: 'gas-giant', note: 'Desaturated steel-blue and ash-gray gas giant orbited by Meridian.' }
          ],
          drakkenTheses: ['Pyric', 'Aqueous', 'Telluric', 'Aeric', 'Umbral'],
        },
        systems: {
          sourceRecord: {
            stableId: 'systems',
            canonicalUrl: systems.canonical_url,
          },
          plannerSummary: {
            bloodRingsNote: 'Drakken vitrified biospheric atrocity-structures. Gorevault renders feedstock; Ringthroat extrudes toward orbit.',
            hookshotNote: 'Connection-based travel infrastructure. Ships latch, tension, and move across stabilized manifolds. Not arbitrary teleportation.',
          },
          stableId: 'systems',
          canonicalUrl: systems.canonical_url,
          bloodRingsNote: 'Drakken vitrified biospheric atrocity-structures. Gorevault renders feedstock; Ringthroat extrudes toward orbit.',
          hookshotNote: 'Connection-based travel infrastructure. Ships latch, tension, and move across stabilized manifolds. Not arbitrary teleportation.',
        },
        worldsvaultTemplates: {
          sourceRecord: {
            stableId: 'worldsvault-templates',
            canonicalUrl: worldsvaultTemplates.canonical_url,
          },
          plannerSummary: {
            namedTemplates: [
              { id: 'syrrian-iv', name: 'Syrrian IV', trait: 'Ground repels adhesion; airborne islands over an atmospheric sea.' },
              { id: 'cumulon-ii', name: 'Cumulon II', trait: 'Memory-Fluid Archive: rivers of hot liquid memory.' },
              { id: 'altostratus-v', name: 'Altostratus V', trait: 'Electric storms rising from surface.' },
              { id: 'nimbus-iii', name: 'Nimbus III', trait: 'Bioluminescent Biosphere: eternal twilight radiance.' },
              { id: 'mistline-xxvi', name: 'Mistline XXVI', trait: 'Continents visible only as humidity gradients.' },
              { id: 'halitus-xxvii', name: 'Halitus XXVII', trait: 'Cryo-Breathing: frozen oceans exhaling steam clouds.' },
              { id: 'nacreous-vi', name: 'Nacreous VI / XXV', trait: 'Prismatic Memory: iridescent pearl skies raining liquid memory.' },
              { id: 'spindrift-xxiii', name: 'Spindrift XXIII', trait: 'Aeolian Civilization: airborne filament weaving.' },
              { id: 'cirrus-i', name: 'Cirrus I', trait: 'Crystalline Continental: translucent glass continents in sky strata.' },
              { id: 'cirrulite-xxx', name: 'Cirrulite XXX', trait: 'Linguistic Ring: rings of refracted language carved into orbit.' }
            ],
            unknownsNotice: 'Template layouts are non-canonical rendering orders; spatial coordinates between templates are unauthored.'
          },
          stableId: 'worldsvault-templates',
          canonicalUrl: worldsvaultTemplates.canonical_url,
          namedTemplates: [
            { id: 'syrrian-iv', name: 'Syrrian IV', trait: 'Ground repels adhesion; airborne islands over an atmospheric sea.' },
            { id: 'cumulon-ii', name: 'Cumulon II', trait: 'Memory-Fluid Archive: rivers of hot liquid memory.' },
            { id: 'altostratus-v', name: 'Altostratus V', trait: 'Electric storms rising from surface.' },
            { id: 'nimbus-iii', name: 'Nimbus III', trait: 'Bioluminescent Biosphere: eternal twilight radiance.' },
            { id: 'mistline-xxvi', name: 'Mistline XXVI', trait: 'Continents visible only as humidity gradients.' },
            { id: 'halitus-xxvii', name: 'Halitus XXVII', trait: 'Cryo-Breathing: frozen oceans exhaling steam clouds.' },
            { id: 'nacreous-vi', name: 'Nacreous VI / XXV', trait: 'Prismatic Memory: iridescent pearl skies raining liquid memory.' },
            { id: 'spindrift-xxiii', name: 'Spindrift XXIII', trait: 'Aeolian Civilization: airborne filament weaving.' },
            { id: 'cirrus-i', name: 'Cirrus I', trait: 'Crystalline Continental: translucent glass continents in sky strata.' },
            { id: 'cirrulite-xxx', name: 'Cirrulite XXX', trait: 'Linguistic Ring: rings of refracted language carved into orbit.' }
          ],
          unknownsNotice: 'Template layouts are non-canonical rendering orders; spatial coordinates between templates are unauthored.'
        }
      }
    };

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log('[Canon Refresh] Successfully generated snapshot at:', OUTPUT_PATH);
  } catch (err) {
    console.warn('[Canon Refresh] Warning: Remote fetch failed:', err.message);
    if (existingSnapshot) {
      console.log('[Canon Refresh] Retaining existing local snapshot.');
    } else {
      console.error('[Canon Refresh] No existing snapshot found and remote unreachable.');
      throw err;
    }
  }
}

run();
