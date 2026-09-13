/**
 * Keyboard shortcut map + dispatcher (UI01).
 *
 * Full keyboard operation for desktop architects and tablet keyboard
 * covers: transport, tools, camera, branches, and panels — with a
 * self-documenting registry rendered by the shortcuts help modal.
 */

export interface ShortcutDefinition {
  id: string;
  keys: string[];
  label: string;
  group: 'Transport' | 'Tools' | 'Camera' | 'System' | 'Panels';
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'toggle-pause', keys: ['Space'], label: 'Play / pause simulation', group: 'Transport' },
  { id: 'step-once', keys: ['.'], label: 'Advance a single physics step', group: 'Transport' },
  { id: 'faster', keys: ['+ / ='], label: 'Increase time acceleration', group: 'Transport' },
  { id: 'slower', keys: ['- / _'], label: 'Decrease time acceleration', group: 'Transport' },
  { id: 'tool-select', keys: ['1'], label: 'Pointer / select tool', group: 'Tools' },
  { id: 'tool-grab', keys: ['2'], label: 'Grab & throw tool', group: 'Tools' },
  { id: 'tool-loom', keys: ['3'], label: 'Orbit loom tool', group: 'Tools' },
  { id: 'tool-create', keys: ['N'], label: 'Create celestial body', group: 'Tools' },
  { id: 'focus-selected', keys: ['F'], label: 'Focus camera on selection', group: 'Camera' },
  { id: 'follow-toggle', keys: ['Shift+F'], label: 'Toggle follow-camera', group: 'Camera' },
  { id: 'top-down', keys: ['T'], label: 'Toggle top-down tactical view', group: 'Camera' },
  { id: 'center-camera', keys: ['C'], label: 'Reset camera to origin', group: 'Camera' },
  { id: 'undo', keys: ['Ctrl+Z'], label: 'Undo last destructive action', group: 'System' },
  { id: 'delete-body', keys: ['Delete'], label: 'Delete selected body (with confirm)', group: 'System' },
  { id: 'toggle-grid', keys: ['G'], label: 'Toggle gravity grid', group: 'System' },
  { id: 'toggle-hz', keys: ['H'], label: 'Toggle habitable-zone overlay', group: 'System' },
  { id: 'fork-branch', keys: ['B'], label: 'Fork timeline branch', group: 'System' },
  { id: 'open-ledger', keys: ['L'], label: 'Open event ledger', group: 'Panels' },
  { id: 'open-navigator', keys: ['V'], label: 'Toggle system navigator', group: 'Panels' },
  { id: 'open-missions', keys: ['M'], label: 'Toggle missions panel', group: 'Panels' },
  { id: 'open-stats', keys: ['S'], label: 'Open system statistics', group: 'Panels' },
  { id: 'open-help', keys: ['?'], label: 'Open keyboard shortcut help', group: 'Panels' },
  { id: 'command-palette', keys: ['Ctrl+K'], label: 'Command palette', group: 'Panels' },
  { id: 'present-capture', keys: ['P'], label: 'Capture showcase PNG (PRESENT mode)', group: 'System' },
  { id: 'close-top', keys: ['Esc'], label: 'Close modal / deselect', group: 'Panels' },
];

export type ShortcutHandler = (id: string) => void;

/** True when the key event targets an editable field (shortcuts suppressed). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

/** Normalize a KeyboardEvent to a shortcut id, or null when unmapped. */
export function shortcutIdForEvent(e: KeyboardEvent): string | null {
  const key = e.key;
  if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'Z')) return 'undo';
  if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'K')) return 'command-palette';
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (key) {
    case ' ': return 'toggle-pause';
    case '.': return 'step-once';
    case '+':
    case '=': return 'faster';
    case '-':
    case '_': return 'slower';
    case '1': return 'tool-select';
    case '2': return 'tool-grab';
    case '3': return 'tool-loom';
    case 'n':
    case 'N': return 'tool-create';
    case 'F': return e.shiftKey ? 'follow-toggle' : 'focus-selected';
    case 'f': return 'focus-selected';
    case 't':
    case 'T': return 'top-down';
    case 'c':
    case 'C': return 'center-camera';
    case 'Delete':
    case 'Backspace': return 'delete-body';
    case 'g':
    case 'G': return 'toggle-grid';
    case 'h':
    case 'H': return 'toggle-hz';
    case 'b':
    case 'B': return 'fork-branch';
    case 'l':
    case 'L': return 'open-ledger';
    case 'v':
    case 'V': return 'open-navigator';
    case 'm':
    case 'M': return 'open-missions';
    case 's':
    case 'S': return 'open-stats';
    case '?': return 'open-help';
    case 'p':
    case 'P': return 'present-capture';
    case 'Escape': return 'close-top';
    default: return null;
  }
}
