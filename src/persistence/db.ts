/**
 * IndexedDB Local Database for System Planner Persistence.
 * 
 * Invariants:
 * - 100% offline-first. No cloud, no analytics, no third-party telemetry.
 * - Stores plain structured JSON schemas. Never serializes Three.js objects.
 */

import { TimelineBranch } from '../branching/branch-types';
import { AsteroidBelt, ConsequenceEvent, HookshotRoute, SystemStatus } from '../simulation/types';

export interface SavedSystemProject {
  schemaVersion: '1.0.0' | '1.1.0';
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
  };
  cameraState: {
    target: { x: number; y: number; z: number };
    distance: number;
    viewMode: string;
  };
  createdAtIso: string;
  updatedAtIso: string;
}

const DB_NAME = 'StarsilkSystemPlannerDB';
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

export async function saveProjectToDb(project: SavedSystemProject): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(project);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadProjectFromDb(projectId: string): Promise<SavedSystemProject | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listAllProjects(): Promise<{ projectId: string; projectName: string; updatedAtIso: string }[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const items: SavedSystemProject[] = req.result || [];
      resolve(
        items.map(p => ({
          projectId: p.projectId,
          projectName: p.projectName,
          updatedAtIso: p.updatedAtIso,
        }))
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectFromDb(projectId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
