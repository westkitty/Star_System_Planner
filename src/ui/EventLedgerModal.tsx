import React from 'react';
import { ConsequenceEvent } from '../simulation/types';
import { formatSimTime } from '../simulation/units';
import { X, AlertCircle, Info, Flame, Sparkles } from 'lucide-react';

interface EventLedgerModalProps {
  events: ConsequenceEvent[];
  onClose: () => void;
}

export const EventLedgerModal: React.FC<EventLedgerModalProps> = ({ events, onClose }) => {
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
        padding: '18px',
        width: '480px',
        maxWidth: '90vw',
        maxHeight: '75vh',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
            CAUSAL EVENT LEDGER ({events.length})
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
              No consequential events recorded yet in this timeline.
            </div>
          ) : (
            events.slice().reverse().map((ev) => {
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
