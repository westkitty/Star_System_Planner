/**
 * Floating first-use coachmark card (UI07).
 */

import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import { COACHMARK_COPY, CoachmarkId } from './coachmarks';

interface CoachmarkProps {
  id: CoachmarkId;
  anchor: 'tool-rail' | 'timeline' | 'inspector' | 'center';
  onDismiss: (id: CoachmarkId) => void;
}

export const Coachmark: React.FC<CoachmarkProps> = ({ id, anchor, onDismiss }) => {
  const copy = COACHMARK_COPY[id];
  return (
    <div className={`coachmark coachmark-${anchor} hud-interactive`} role="note" aria-label={copy.title}>
      <Lightbulb size={15} color="#ffd166" />
      <div className="coachmark-body">
        <div className="coachmark-title">{copy.title}</div>
        <div className="coachmark-text">{copy.body}</div>
      </div>
      <button className="coachmark-x" onClick={() => onDismiss(id)} aria-label="Dismiss hint">
        <X size={13} />
      </button>
    </div>
  );
};
