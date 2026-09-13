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
  if (!q) return listCommands().slice(0, limit);
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
