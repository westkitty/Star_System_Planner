/**
 * Selection breadcrumb chip (UI14 + UI02 bookmark + UI14 apsidal clock).
 *
 * Lineage pill with focus/grab/deselect, a bookmark star for the
 * quick-jump shelf, and a live apsidal countdown ("Periapsis T−3.2d") for
 * bound orbits so the next turning point is always legible.
 */

import React, { useMemo } from 'react';
import { Focus, Hand, X, ChevronLeft, ChevronRight, Star, Timer } from 'lucide-react';
import { CelestialBody } from '../simulation/types';
import { calculateOsculatingElements } from '../simulation/orbital-mechanics';
import { formatCountdown } from '../simulation/units';

interface SelectionChipProps {
  selected: CelestialBody;
  primary: CelestialBody | null;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onFocus: () => void;
  onGrab: () => void;
  onDeselect: () => void;
  /** Selection-history traversal (iteration 3, UI07). */
  onBack?: () => void;
  onForward?: () => void;
  canBack?: boolean;
  canForward?: boolean;
}

export const SelectionChip: React.FC<SelectionChipProps> = ({
  selected,
  primary,
  bookmarked,
  onToggleBookmark,
  onFocus,
  onGrab,
  onDeselect,
  onBack,
  onForward,
  canBack,
  canForward,
}) => {
  const apsidal = useMemo(() => {
    if (!primary || primary.id === selected.id) return null;
    const el = calculateOsculatingElements(selected, primary);
    if (!el || !el.isBound || !(el.meanMotionRadSec > 0)) return null;
    // Mean-anomaly phase → time to next apsis (periapsis at M=0).
    const trueAnom = ((el.trueAnomalyDeg * Math.PI) / 180) % (Math.PI * 2);
    const e = Math.min(0.99, Math.max(0, el.eccentricity));
    const eccentricAnom = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnom / 2), Math.sqrt(1 + e) * Math.cos(trueAnom / 2));
    const meanAnom = (eccentricAnom - e * Math.sin(eccentricAnom) + Math.PI * 2) % (Math.PI * 2);
    const toPeri = ((Math.PI * 2 - meanAnom) % (Math.PI * 2)) / el.meanMotionRadSec;
    const toApo = ((Math.PI - meanAnom + Math.PI * 2) % (Math.PI * 2)) / el.meanMotionRadSec;
    if (toPeri <= toApo) return { label: 'Periapsis', seconds: toPeri };
    return { label: 'Apoapsis', seconds: toApo };
  }, [selected, primary]);

  return (
    <div className="selection-chip hud-interactive" role="status" aria-label={`Selected ${selected.name}`}>
      {onBack && onForward && (
        <>
          <button className="selection-action" onClick={onBack} disabled={!canBack} title="Previous selection (Alt+Left)" aria-label="Previous selection">
            <ChevronLeft size={13} />
          </button>
          <button className="selection-action" onClick={onForward} disabled={!canForward} title="Next selection (Alt+Right)" aria-label="Next selection">
            <ChevronRight size={13} />
          </button>
          <span className="selection-divider" />
        </>
      )}
      {primary && (
        <>
          <span className="selection-crumb primary">{primary.name}</span>
          <ChevronRight size={12} color="var(--text-muted)" />
        </>
      )}
      <span className="selection-crumb current">{selected.name}</span>
      <span className="selection-type">{selected.type.replace('_', ' ')}</span>
      {apsidal && (
        <span className="selection-apsis" title="Time to the next orbital turning point">
          <Timer size={12} /> {apsidal.label} T−{formatCountdown(apsidal.seconds)}
        </span>
      )}
      <span className="selection-divider" />
      <button
        className={`selection-action ${bookmarked ? 'active' : ''}`}
        onClick={onToggleBookmark}
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this world (quick-jump shelf)'}
        aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this world'}
        aria-pressed={bookmarked}
      >
        <Star size={13} />
      </button>
      <button className="selection-action" onClick={onFocus} title="Focus camera (F)" aria-label="Focus camera">
        <Focus size={13} />
      </button>
      <button className="selection-action" onClick={onGrab} title="Grab and throw (2)" aria-label="Grab body">
        <Hand size={13} />
      </button>
      <button className="selection-action" onClick={onDeselect} title="Deselect (Esc)" aria-label="Deselect">
        <X size={13} />
      </button>
    </div>
  );
};
