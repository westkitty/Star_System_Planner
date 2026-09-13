/**
 * Searchable system navigator panel (UI07).
 *
 * A hierarchical census of every body (stars → planets → moons → stations)
 * with live search, per-type counts, one-tap select/focus, and spectral
 * badges — the fastest way to find a world in a crowded system.
 */

import React, { useMemo, useState } from 'react';
import { Search, Focus, Circle, Sun, Moon, Radio, AlertTriangle } from 'lucide-react';
import { CelestialBody } from '../simulation/types';
import { spectralClassForMass } from '../rendering/star-palette';

interface SystemNavigatorProps {
  bodies: CelestialBody[];
  selectedBodyId: string | null;
  onSelectBody: (id: string) => void;
  onFocusBody: (id: string) => void;
  onClose: () => void;
}

function typeIcon(type: CelestialBody['type']): React.ReactNode {
  switch (type) {
    case 'star': return <Sun size={13} color="#ffdd66" />;
    case 'moon': return <Moon size={13} color="#99a3b0" />;
    case 'station':
    case 'ship': return <Radio size={13} color="#e2e8f0" />;
    case 'black_hole': return <Circle size={13} color="#a855f7" />;
    default: return <Circle size={13} color="#0cc6ff" />;
  }
}

export const SystemNavigator: React.FC<SystemNavigatorProps> = ({
  bodies,
  selectedBodyId,
  onSelectBody,
  onFocusBody,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (b: CelestialBody): number => {
      switch (b.type) {
        case 'star': return 0;
        case 'black_hole': return 1;
        case 'planet':
        case 'dwarf_planet': return 2;
        case 'moon': return 3;
        default: return 4;
      }
    };
    return [...bodies]
      .filter((b) => !q || b.name.toLowerCase().includes(q) || b.type.includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [bodies, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bodies) c[b.type] = (c[b.type] ?? 0) + 1;
    return c;
  }, [bodies]);

  return (
    <aside className="navigator-panel hud-interactive" aria-label="System navigator">
      <div className="navigator-header">
        <span className="navigator-title">System Census</span>
        <span className="navigator-count">{bodies.length} bodies</span>
        <button className="navigator-close" onClick={onClose} aria-label="Close navigator">
          ×
        </button>
      </div>
      <div className="navigator-search">
        <Search size={14} color="var(--text-muted)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worlds, stations..."
          aria-label="Search bodies"
        />
      </div>
      <div className="navigator-counts">
        {Object.entries(counts).map(([type, n]) => (
          <span key={type} className="navigator-count-chip">
            {type.replace('_', ' ')} · {n}
          </span>
        ))}
      </div>
      <div className="navigator-list" role="listbox" aria-label="Celestial bodies">
        {filtered.length === 0 && (
          <div className="navigator-empty">
            <AlertTriangle size={18} color="var(--text-muted)" />
            <div>No bodies match “{query}”.</div>
            <div className="navigator-empty-hint">Try a type name like “moon” or “station”.</div>
          </div>
        )}
        {filtered.map((b) => (
          <div
            key={b.id}
            role="option"
            aria-selected={b.id === selectedBodyId}
            className={`navigator-row ${b.id === selectedBodyId ? 'selected' : ''}`}
            onClick={() => onSelectBody(b.id)}
          >
            <span className="navigator-icon">{typeIcon(b.type)}</span>
            <span className="navigator-name">{b.name}</span>
            {b.type === 'star' && (
              <span className="navigator-badge">{spectralClassForMass(b.massKg).class}</span>
            )}
            {b.unauthored_in_source && <span className="navigator-badge demo">demo</span>}
            <button
              className="navigator-focus"
              title={`Focus camera on ${b.name}`}
              aria-label={`Focus camera on ${b.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onFocusBody(b.id);
              }}
            >
              <Focus size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
};
