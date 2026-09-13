/**
 * Causal event ledger modal (UI09 empty state + severity filtering).
 *
 * Immutable history with severity filter chips, an illustrated empty
 * state guiding first-time architects, and accessible modal behavior.
 */

import React, { useState } from 'react';
import { ConsequenceEvent } from '../simulation/types';
import { formatSimTime } from '../simulation/units';
import { X, AlertCircle, Info, Flame, Sparkles, ScrollText } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

interface EventLedgerModalProps {
  events: ConsequenceEvent[];
  onClose: () => void;
}

type SeverityFilter = 'all' | 'info' | 'caution' | 'catastrophe';

const FILTERS: Array<{ id: SeverityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'caution', label: 'Caution' },
  { id: 'catastrophe', label: 'Catastrophe' },
];

export const EventLedgerModal: React.FC<EventLedgerModalProps> = ({ events, onClose }) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const visible = filter === 'all' ? events : events.filter((e) => e.severity === filter);

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
          <h3 className="modal-title">CAUSAL EVENT LEDGER ({events.length})</h3>
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
              <div className="empty-state-hint">Loosen the severity filter to see more history.</div>
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
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
