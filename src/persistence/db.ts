/**
 * IndexedDB Local Database for System Planner Persistence.
 *
 * Invariants:
 * - 100% offline-first. No cloud, no analytics, no third-party telemetry.
 * - Stores plain structured JSON schemas. Never serializes Three.js objects.
 * - Schema '1.1.0' adds extended visual-lens settings and real camera state;
 *   '1.0.0' payloads migrate forward transparently.
 */

import { TimelineBranch } from '../branching/branch-types';
import { AsteroidBelt, ConsequenceEvent, HookshotRoute, SystemStatus } from '../simulation/types';

export type ProjectSchemaVersion = '1.0.0' | '1.1.0';

export interface SavedSystemProject {
  schemaVersion: ProjectSchemaVersion;
  projectId: string;
  projectName: string;
  seed: number;
  branches: TimelineBranch[];
  activeBranchId: string;
  events: ConsequenceEvent[];
  systemStatus?: SystemStatus;
  belts?: AsteroidBelt[];
  hookshotRoutes?: HookshotRoute[];
  simulationSettings: {
    enableCollisions: boolean;
    timeScale: number;
  };
  visualSettings: {
    scaleMode: 'true' | 'readable';
    showFuture: boolean;
    showSensitivity: boolean;
    showGravityGrid: boolean;
    showXRay?: boolean;
    showLabels?: boolean;
    showTrails?: boolean;
    showHabitableZone?: boolean;
  };
  cameraState: {
    target: { x: number; y: number; z: number };
    distance: number;
    viewMode: string;
  };
  createdAtIso: string;
  updatedAtIso: string;
}

/** Current writer schema. */
export const CURRENT_SCHEMA_VERSION: ProjectSchemaVersion = '1.1.0';

const DB_NAME = 'starsilk-system-planner-db';
const DB_VERSION = 1;
const STORE_NAME = 'systems';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in current environment'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save with full transaction completion semantics (req.onsuccess fires early;
 * tx.oncomplete is the durable point) and guaranteed connection release.
 */
export async function saveProjectToDb(project: SavedSystemProject): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function loadProjectFromDb(projectId: string): Promise<SavedSystemProject | null> {
  const db = await openDatabase();
  try {
    return await new Promise<SavedSystemProject | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export interface DatabaseProjectSummary {
  projectId: string;
  projectName: string;
  updatedAtIso: string;
}

export async function listAllProjects(): Promise<DatabaseProjectSummary[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items: SavedSystemProject[] = req.result || [];
        resolve(
          items
            .map(p => ({
              projectId: p.projectId,
              projectName: p.projectName,
              updatedAtIso: p.updatedAtIso,
            }))
            .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
        );
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteProjectFromDb(projectId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}
