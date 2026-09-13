/**
 * Causal event ledger modal (UI09 empty state + severity filtering).
 *
 * Immutable history with severity filter chips, an illustrated empty
 * state guiding first-time architects, and accessible modal behavior.
 */

import React, { useMemo, useState } from 'react';
import { ConsequenceEvent } from '../simulation/types';
import { formatSimTime } from '../simulation/units';
import { X, AlertCircle, Info, Flame, Sparkles, ScrollText, Crosshair, Copy, Check } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

interface EventLedgerModalProps {
  events: ConsequenceEvent[];
  onClose: () => void;
  /** Jump the camera to the event's primary body (UI05). */
  onFocusBody?: (bodyId: string) => void;
}

type SeverityFilter = 'all' | 'info' | 'caution' | 'catastrophe';

const FILTERS: Array<{ id: SeverityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'caution', label: 'Caution' },
  { id: 'catastrophe', label: 'Catastrophe' },
];

export const EventLedgerModal: React.FC<EventLedgerModalProps> = ({ events, onClose, onFocusBody }) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== 'all' && e.severity !== filter) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q && !`${e.title} ${e.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filter, typeFilter, query]);
  const copyVisible = (): void => {
    try {
      void navigator.clipboard?.writeText(JSON.stringify(visible, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="modal-backdrop hud-interactive" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel ledger-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Causal event ledger"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row ledger-header">
          <h3 className="modal-title">CAUSAL EVENT LEDGER ({visible.length}/{events.length})</h3>
          <button onClick={onClose} className="modal-x" aria-label="Close ledger">
            <X size={16} />
          </button>
        </div>

        <div className="ledger-filters" role="group" aria-label="Filter by severity">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`filter-chip ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ledger-tools">
          <input
            className="ledger-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description…"
            aria-label="Search events"
          />
          <select
            className="ledger-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by event type"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="ledger-copy" onClick={copyVisible} title="Copy filtered events as JSON">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="ledger-list">
          {events.length === 0 ? (
            <div className="empty-state">
              <ScrollText size={30} color="var(--text-muted)" />
              <div className="empty-state-title">A quiet universe — for now</div>
              <div className="empty-state-hint">
                Every throw, collision, fork, and macro is etched here permanently. Fling a moon at a
                planet to write your first entry.
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty-state">
              <Info size={24} color="var(--text-muted)" />
              <div className="empty-state-title">No {filter} events</div>
              <div className="empty-state-hint">Loosen the severity, type, or search filters to see more history.</div>
            </div>
          ) : (
            visible.slice().reverse().map((ev) => {
              const isCatastrophe = ev.severity === 'catastrophe';
              const isCaution = ev.severity === 'caution';
              return (
                <div
                  key={ev.id}
                  className={`ledger-entry ${isCatastrophe ? 'catastrophe' : isCaution ? 'caution' : ''}`}
                >
                  <div className="ledger-entry-head">
                    <div className={`ledger-entry-title ${isCatastrophe ? 'catastrophe' : ''}`}>
                      {isCatastrophe ? <Flame size={14} /> : ev.type === 'starsilk_pull' ? <Sparkles size={14} /> : isCaution ? <AlertCircle size={14} /> : <Info size={14} />}
                      <span>{ev.title}</span>
                    </div>
                    <span className="ledger-entry-time">T+ {formatSimTime(ev.timestampSec)}</span>
                  </div>
                  <div className="ledger-entry-desc">{ev.description}</div>
                  {onFocusBody && ev.bodyIds && ev.bodyIds.length > 0 && (
                    <button
                      className="ledger-jump"
                      onClick={() => ev.bodyIds && onFocusBody(ev.bodyIds[0])}
                      title="Jump camera to the involved body"
                      aria-label={`Jump to ${ev.title}`}
                    >
                      <Crosshair size={12} /> Visit site
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
