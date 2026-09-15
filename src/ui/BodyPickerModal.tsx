import React, { useMemo, useState } from 'react';
import { ModalShell } from './ModalShell';
import { CelestialBody } from '../simulation/types';
import { formatDistance } from '../simulation/units';
import { Star, Globe, Moon, Rocket, Crosshair } from 'lucide-react';

interface BodyPickerModalProps {
  bodies: CelestialBody[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}

const TYPE_ORDER: Record<string, number> = {
  star: 0, black_hole: 1, planet: 2, dwarf_planet: 3, moon: 4, asteroid: 5, station: 6, ship: 7, other: 8,
};

const typeIcon = (t: string) => {
  switch (t) {
    case 'star': return <Star size={13} color="#ffd166" />;
    case 'moon': return <Moon size={13} color="#94a3b8" />;
    case 'ship':
    case 'station': return <Rocket size={13} color="#49e7ff" />;
    default: return <Globe size={13} color="#0cc6ff" />;
  }
};

/** Searchable body directory — the fast way to find anything in a crowded system. */
export const BodyPickerModal: React.FC<BodyPickerModalProps> = ({ bodies, selectedId, onPick, onClose }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bodies
      .filter(b => !q || b.name.toLowerCase().includes(q) || b.type.toLowerCase().includes(q))
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.name.localeCompare(b.name));
  }, [bodies, query]);

  return (
    <ModalShell title="BODY DIRECTORY" subtitle={`${bodies.length} active bodies`} onClose={onClose} width={440}>
      <input
        className="text-input"
        placeholder="Search by name or type…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="picker-list" style={{ marginTop: 12 }}>
        {filtered.length === 0 && (
          <div className="empty-state">No match in this timeline.</div>
        )}
        {filtered.map(b => {
          const r = Math.hypot(b.position.x, b.position.y, b.position.z);
          return (
            <button
              key={b.id}
              className={`picker-row ${b.id === selectedId ? 'active' : ''}`}
              onClick={() => onPick(b.id)}
            >
              {typeIcon(b.type)}
              <span className="picker-name">{b.name}</span>
              <span className="picker-meta">{formatDistance(r)}</span>
              <Crosshair size={12} style={{ opacity: 0.5 }} />
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
};
