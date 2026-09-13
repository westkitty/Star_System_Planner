/**
 * Searchable system navigator panel (UI07 + UI12 tree + UI02 bookmarks).
 *
 * Two complementary views over the census: flat ranked search for finding
 * anything by name, and a true primary→satellite hierarchy (stars →
 * planets → moons → stations) for understanding structure. Bookmarked
 * worlds pin to a quick-jump shelf above both views.
 */

import React, { useMemo, useState } from 'react';
import { Search, Focus, Circle, Sun, Moon, Radio, AlertTriangle, ListTree, List, Star } from 'lucide-react';
import { CelestialBody } from '../simulation/types';
import { spectralClassForMass } from '../rendering/star-palette';

interface SystemNavigatorProps {
  bodies: CelestialBody[];
  selectedBodyId: string | null;
  bookmarkedIds: string[];
  onSelectBody: (id: string) => void;
  onFocusBody: (id: string) => void;
  onToggleBookmark: (id: string) => void;
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

interface TreeNode {
  body: CelestialBody;
  depth: number;
}

function buildHierarchy(bodies: CelestialBody[]): TreeNode[] {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const children = new Map<string, CelestialBody[]>();
  const roots: CelestialBody[] = [];
  const rank = (b: CelestialBody): number =>
    b.type === 'star' ? 0 : b.type === 'black_hole' ? 1 : b.type === 'planet' || b.type === 'dwarf_planet' ? 2 : b.type === 'moon' ? 3 : 4;
  for (const b of bodies) {
    const parentId = b.primaryId && byId.has(b.primaryId) ? b.primaryId : null;
    if (parentId && parentId !== b.id) {
      const list = children.get(parentId) ?? [];
      list.push(b);
      children.set(parentId, list);
    } else {
      roots.push(b);
    }
  }
  const out: TreeNode[] = [];
  const visit = (b: CelestialBody, depth: number): void => {
    out.push({ body: b, depth });
    const kids = (children.get(b.id) ?? []).sort((a, c) => rank(a) - rank(c) || a.name.localeCompare(c.name));
    for (const k of kids) visit(k, depth + 1);
  };
  roots.sort((a, c) => rank(a) - rank(c) || a.name.localeCompare(c.name)).forEach((r) => visit(r, 0));
  // Orphans whose primary vanished still appear (roots already include them).
  return out;
}

export const SystemNavigator: React.FC<SystemNavigatorProps> = ({
  bodies,
  selectedBodyId,
  bookmarkedIds,
  onSelectBody,
  onFocusBody,
  onToggleBookmark,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [treeMode, setTreeMode] = useState(true);
  const [sortMode, setSortMode] = useState<'rank' | 'name' | 'type' | 'distance'>('rank');
  const [hideCraft, setHideCraft] = useState(false);
  const center = useMemo(() => bodies.find((b) => b.type === 'star') ?? bodies[0] ?? null, [bodies]);

  const bookmarked = useMemo(
    () => bookmarkedIds.map((id) => bodies.find((b) => b.id === id)).filter((b): b is CelestialBody => Boolean(b)),
    [bodies, bookmarkedIds]
  );

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
    const distOf = (b: CelestialBody): number =>
      center
        ? Math.hypot(b.position.x - center.position.x, b.position.y - center.position.y, b.position.z - center.position.z)
        : 0;
    const isCraft = (b: CelestialBody): boolean => b.type === 'station' || b.type === 'ship';
    return [...bodies]
      .filter((b) => (!hideCraft || !isCraft(b)) && (!q || b.name.toLowerCase().includes(q) || b.type.includes(q)))
      .sort((a, b) => {
        if (sortMode === 'name') return a.name.localeCompare(b.name);
        if (sortMode === 'type') return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        if (sortMode === 'distance') return distOf(a) - distOf(b);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  }, [bodies, query, sortMode, hideCraft, center]);

  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodes = buildHierarchy(bodies);
    if (!q) return nodes;
    // In tree mode, search keeps matching nodes plus their ancestor chain.
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const keep = new Set<string>();
    for (const b of bodies) {
      if (b.name.toLowerCase().includes(q) || b.type.includes(q)) {
        let cursor: CelestialBody | undefined = b;
        while (cursor) {
          keep.add(cursor.id);
          cursor = cursor.primaryId ? byId.get(cursor.primaryId) : undefined;
        }
      }
    }
    const isCraft = (b: CelestialBody): boolean => b.type === 'station' || b.type === 'ship';
    return nodes.filter((n) => keep.has(n.body.id) && (!hideCraft || !isCraft(n.body)));
  }, [bodies, query, hideCraft]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of bodies) c[b.type] = (c[b.type] ?? 0) + 1;
    return c;
  }, [bodies]);

  const renderRow = (b: CelestialBody, depth: number): React.ReactNode => (
    <div
      key={b.id}
      role="option"
      aria-selected={b.id === selectedBodyId}
      className={`navigator-row ${b.id === selectedBodyId ? 'selected' : ''}`}
      style={treeMode && depth > 0 ? { paddingLeft: `${10 + depth * 16}px` } : undefined}
      onClick={() => onSelectBody(b.id)}
    >
      {treeMode && depth > 0 && <span className="navigator-branch" aria-hidden="true">└</span>}
      <span className="navigator-icon">{typeIcon(b.type)}</span>
      <span className="navigator-name">{b.name}</span>
      {b.type === 'star' && (
        <span className="navigator-badge">{spectralClassForMass(b.massKg).class}</span>
      )}
      {b.unauthored_in_source && <span className="navigator-badge demo">demo</span>}
      <button
        className={`navigator-bookmark ${bookmarkedIds.includes(b.id) ? 'active' : ''}`}
        title={bookmarkedIds.includes(b.id) ? 'Remove bookmark' : 'Bookmark this world'}
        aria-label={`${bookmarkedIds.includes(b.id) ? 'Remove bookmark for' : 'Bookmark'} ${b.name}`}
        aria-pressed={bookmarkedIds.includes(b.id)}
        onClick={(e) => {
          e.stopPropagation();
          onToggleBookmark(b.id);
        }}
      >
        <Star size={12} />
      </button>
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
  );

  const rows = treeMode ? tree : filtered.map((b) => ({ body: b, depth: 0 }));

  return (
    <aside className="navigator-panel hud-interactive" aria-label="System navigator">
      <div className="navigator-header">
        <span className="navigator-title">System Census</span>
        <span className="navigator-count">{bodies.length} bodies</span>
        <button
          className="navigator-mode"
          onClick={() => setTreeMode((m) => !m)}
          title={treeMode ? 'Switch to flat search list' : 'Switch to hierarchy tree'}
          aria-label={treeMode ? 'Switch to flat list' : 'Switch to hierarchy tree'}
          aria-pressed={treeMode}
        >
          {treeMode ? <ListTree size={13} /> : <List size={13} />}
        </button>
        <button className="navigator-close" onClick={onClose} aria-label="Close navigator">
          ×
        </button>
      </div>
      {bookmarked.length > 0 && (
        <div className="navigator-shelf" aria-label="Bookmarked worlds">
          {bookmarked.map((b) => (
            <button
              key={b.id}
              className={`navigator-shelf-chip ${b.id === selectedBodyId ? 'selected' : ''}`}
              onClick={() => onSelectBody(b.id)}
              title={`Jump to ${b.name}`}
            >
              <Star size={11} /> {b.name}
            </button>
          ))}
        </div>
      )}
      <div className="navigator-search">
        <Search size={14} color="var(--text-muted)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worlds, stations..."
          aria-label="Search bodies"
        />
      </div>
      <div className="navigator-tools">
        <select
          className="navigator-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as 'rank' | 'name' | 'type' | 'distance')}
          aria-label="Sort bodies"
          title="Sort order"
        >
          <option value="rank">Type rank</option>
          <option value="name">Name A–Z</option>
          <option value="type">Type A–Z</option>
          <option value="distance">Distance ★</option>
        </select>
        <label className="navigator-craft-toggle" title="Hide stations and ships">
          <input type="checkbox" checked={hideCraft} onChange={(e) => setHideCraft(e.target.checked)} />
          Hide craft
        </label>
      </div>
      <div className="navigator-counts">
        {Object.entries(counts).map(([type, n]) => (
          <span key={type} className="navigator-count-chip">
            {type.replace('_', ' ')} · {n}
          </span>
        ))}
      </div>
      <div className="navigator-list" role="listbox" aria-label="Celestial bodies">
        {rows.length === 0 && (
          <div className="navigator-empty">
            <AlertTriangle size={18} color="var(--text-muted)" />
            <div>No bodies match “{query}”.</div>
            <div className="navigator-empty-hint">Try a type name like “moon” or “station”.</div>
          </div>
        )}
        {rows.map((n) => renderRow(n.body, n.depth))}
      </div>
    </aside>
  );
};
