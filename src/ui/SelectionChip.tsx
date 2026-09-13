/**
 * Selection breadcrumb chip (UI14).
 *
 * A persistent bottom-center pill showing selected body → primary lineage
 * with one-tap focus, grab, and deselect actions — selection state stays
 * legible even when the inspector is scrolled or crowded.
 */

import React from 'react';
import { Focus, Hand, X, ChevronRight } from 'lucide-react';
import { CelestialBody } from '../simulation/types';

interface SelectionChipProps {
  selected: CelestialBody;
  primary: CelestialBody | null;
  onFocus: () => void;
  onGrab: () => void;
  onDeselect: () => void;
}

export const SelectionChip: React.FC<SelectionChipProps> = ({
  selected,
  primary,
  onFocus,
  onGrab,
  onDeselect,
}) => {
  return (
    <div className="selection-chip hud-interactive" role="status" aria-label={`Selected ${selected.name}`}>
      {primary && (
        <>
          <span className="selection-crumb primary">{primary.name}</span>
          <ChevronRight size={12} color="var(--text-muted)" />
        </>
      )}
      <span className="selection-crumb current">{selected.name}</span>
      <span className="selection-type">{selected.type.replace('_', ' ')}</span>
      <span className="selection-divider" />
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
