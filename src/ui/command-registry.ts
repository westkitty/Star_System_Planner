/**
 * Command palette registry (UI01).
 *
 * A fuzzy-searchable index of planner verbs (transport, tools, branches,
 * presets, toggles) plus nouns (bodies, branches). The App registers
 * closures on boot; the palette searches and executes without knowing
 * any subsystem.
 */

export interface PlannerCommand {
  id: string;
  title: string;
  hint?: string;
  keywords?: string;
  section: 'Transport' | 'Tools' | 'Bodies' | 'Branches' | 'System';
  run: () => void;
}

const commands = new Map<string, PlannerCommand>();

export function registerCommand(cmd: PlannerCommand): void {
  commands.set(cmd.id, cmd);
}

export function registerCommands(cmds: PlannerCommand[]): void {
  for (const c of cmds) commands.set(c.id, c);
}

export function unregisterCommand(id: string): void {
  commands.delete(id);
}

export function listCommands(): PlannerCommand[] {
  return [...commands.values()];
}

/** Subsequence fuzzy score; higher is better, -1 means no match. */
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 + q.length * 4 - (t.indexOf(q) > 0 ? t.indexOf(q) : 0);
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += lastMatch === i - 1 ? 3 : 1;
      lastMatch = i;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}

export function searchCommands(query: string, limit = 12): PlannerCommand[] {
  const q = query.trim();
  if (!q) return recentFirst(listCommands(), limit);
  return listCommands()
    .map((c) => ({
      cmd: c,
      score: Math.max(
        fuzzyScore(q, c.title),
        fuzzyScore(q, `${c.keywords ?? ''} ${c.hint ?? ''}`) - 2
      ),
    }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.cmd);
}

export function clearCommandsForTests(): void {
  commands.clear();
}

/**
 * Recently-used command recall (iteration 3, UI02).
 *
 * Command ids executed through the palette persist across sessions; an
 * empty query surfaces them first so repeat workflows stay one keypress
 * away instead of buried in registration order.
 */
const RECENT_KEY = 'starsilk-palette-recent-v1';
const MAX_RECENT = 8;

function loadRecentIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

let recentIds: string[] | null = null;

function recentIdList(): string[] {
  if (!recentIds) recentIds = loadRecentIds();
  return recentIds;
}

/** Record a palette execution for recency ranking. */
export function recordCommandUse(id: string): void {
  const list = recentIdList().filter((x) => x !== id);
  list.unshift(id);
  recentIds = list.slice(0, MAX_RECENT);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  } catch {
    /* private mode: recency lasts the session */
  }
}

/** Ids of recently used commands, most recent first. */
export function getRecentIds(): string[] {
  return [...recentIdList()];
}

/** Recently used commands that are still registered, most recent first. */
export function getRecentCommands(limit = 5): PlannerCommand[] {
  const out: PlannerCommand[] = [];
  for (const id of recentIdList()) {
    const cmd = commands.get(id);
    if (cmd) out.push(cmd);
    if (out.length >= limit) break;
  }
  return out;
}

function recentFirst(all: PlannerCommand[], limit: number): PlannerCommand[] {
  const recents = getRecentCommands(limit);
  const seen = new Set(recents.map((c) => c.id));
  return [...recents, ...all.filter((c) => !seen.has(c.id))].slice(0, limit);
}

export function clearRecentForTests(): void {
  recentIds = [];
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
