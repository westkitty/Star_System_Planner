import React, { useMemo, useState } from 'react';
import { ConsequenceEvent } from '../simulation/types';
import { formatSimTime } from '../simulation/units';
import { X, AlertCircle, Info, Flame, Sparkles } from 'lucide-react';

interface EventLedgerModalProps {
  events: ConsequenceEvent[];
  simTimeSec?: number;
  onClose: () => void;
}

const FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'catastrophe', label: 'CATASTROPHES' },
  { id: 'caution', label: 'CAUTIONS' },
  { id: 'info', label: 'ROUTINE' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export const EventLedgerModal: React.FC<EventLedgerModalProps> = ({ events, simTimeSec, onClose }) => {
  const [filter, setFilter] = useState<FilterId>('all');

  const visibleEvents = useMemo(
    () => (filter === 'all' ? events : events.filter(e => e.severity === filter)),
    [events, filter]
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(3, 5, 10, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="hud-interactive"
    >
      <div style={{
        background: '#07131e',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        width: 'min(560px, 92vw)',
        maxHeight: '80vh',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '13px', letterSpacing: '0.1em', color: '#49e7ff' }}>
            CAUSAL EVENT LEDGER ({visibleEvents.length}{filter !== 'all' ? ` / ${events.length}` : ''})
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Severity rail + live NOW marker */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'center' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: filter === f.id ? 'rgba(12, 198, 255, 0.18)' : 'rgba(10, 42, 68, 0.4)',
                border: `1px solid ${filter === f.id ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
                color: filter === f.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                borderRadius: '5px',
                padding: '4px 10px',
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
          {simTimeSec !== undefined && (
            <span style={{ marginLeft: 'auto', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              NOW T+ {formatSimTime(simTimeSec)}
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibleEvents.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
              {events.length === 0
                ? 'No consequential events recorded yet in this timeline.'
                : 'No events at this severity in this timeline.'}
            </div>
          ) : (
            visibleEvents.slice().reverse().map((ev) => {
              const isCatastrophe = ev.severity === 'catastrophe';
              const isCaution = ev.severity === 'caution';

              return (
                <div
                  key={ev.id}
                  style={{
                    background: isCatastrophe ? 'rgba(168, 0, 24, 0.15)' : 'rgba(3, 5, 10, 0.6)',
                    border: `1px solid ${isCatastrophe ? '#ff4d64' : isCaution ? '#ffaa00' : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: isCatastrophe ? '#ff4d64' : 'var(--text-primary)' }}>
                      {isCatastrophe ? <Flame size={14} /> : ev.type === 'starsilk_pull' ? <Sparkles size={14} /> : isCaution ? <AlertCircle size={14} /> : <Info size={14} />}
                      <span>{ev.title}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      T+ {formatSimTime(ev.timestampSec)}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {ev.description}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
