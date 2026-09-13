/**
 * Project library store (BACK03).
 *
 * Multi-project management over the IndexedDB systems store: named
 * checkpoints can be saved, listed, reloaded, and deleted, with a
 * last-opened ledger so long-term architects keep a working shelf of
 * universes instead of a single slot.
 */

import {
  SavedSystemProject,
  deleteProjectFromDb,
  listAllProjects,
  loadProjectFromDb,
  saveProjectToDb,
} from './db';

export interface LibraryEntry {
  projectId: string;
  projectName: string;
  updatedAtIso: string;
  lastOpenedIso: string | null;
}

const LAST_OPENED_KEY = 'starsilk-library-last-opened-v1';

function loadLastOpened(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LAST_OPENED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveLastOpened(map: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const projects = await listAllProjects();
  const opened = loadLastOpened();
  return projects
    .map((p) => ({ ...p, lastOpenedIso: opened[p.projectId] ?? null }))
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

export async function saveToLibrary(project: SavedSystemProject): Promise<void> {
  await saveProjectToDb(project);
  const opened = loadLastOpened();
  opened[project.projectId] = new Date().toISOString();
  saveLastOpened(opened);
}

export async function loadFromLibrary(projectId: string): Promise<SavedSystemProject | null> {
  const project = await loadProjectFromDb(projectId);
  if (project) {
    const opened = loadLastOpened();
    opened[projectId] = new Date().toISOString();
    saveLastOpened(opened);
  }
  return project;
}

export async function deleteFromLibrary(projectId: string): Promise<void> {
  await deleteProjectFromDb(projectId);
  const opened = loadLastOpened();
  delete opened[projectId];
  saveLastOpened(opened);
}
