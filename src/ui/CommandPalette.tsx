/**
 * Command palette (UI01).
 *
 * Ctrl/⌘+K fuzzy finder over every planner verb and noun. Full keyboard
 * navigation (up/down/enter/esc), section labels, and one-tap touch rows
 * for tablet architects who live in the flow state.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { getRecentCommands, recordCommandUse, searchCommands } from './command-registry';
import { useModalA11y } from './modal-a11y';

interface CommandPaletteProps {
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onClose }) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchCommands(query), [query]);
  const emptyQuery = query.trim().length === 0;
  const recents = useMemo(() => (emptyQuery ? getRecentCommands(5) : []), [emptyQuery, query]);
  // searchCommands('') already ranks recents first; count them for headers.
  const recentCount = emptyQuery ? Math.min(recents.length, results.length) : 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const execute = (index: number): void => {
    const cmd = results[index];
    if (!cmd) return;
    recordCommandUse(cmd.id);
    onClose();
    // Defer so the palette unmounts before side effects (modal stacking).
    setTimeout(() => cmd.run(), 0);
  };

  return (
    <div className="modal-backdrop hud-interactive palette-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            execute(active);
          }
        }}
      >
        <div className="palette-input-row">
          <Terminal size={16} color="var(--accent)" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Type a command, body, or branch…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search commands"
            aria-expanded={results.length > 0}
            role="combobox"
            aria-autocomplete="list"
          />
          <kbd className="palette-kbd">esc</kbd>
        </div>
        <div className="palette-results" role="listbox" aria-label="Matching commands">
          {results.length === 0 && (
            <div className="palette-empty">No matching commands. Try “fork”, “step”, or a body name.</div>
          )}
          {results.map((cmd, i) => (
            <React.Fragment key={cmd.id}>
              {i === 0 && recentCount > 0 && <div className="palette-section-head">Recent</div>}
              {i === recentCount && recentCount > 0 && recentCount < results.length && (
                <div className="palette-section-head">All commands</div>
              )}
              <button
                role="option"
                aria-selected={i === active}
                className={`palette-row ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => execute(i)}
              >
                <span className="palette-section">{cmd.section}</span>
                <span className="palette-title">{cmd.title}</span>
                {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
