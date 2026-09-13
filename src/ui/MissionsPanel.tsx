/**
 * Guided-challenge missions panel (GAME14 presentation layer).
 *
 * Progress ring, per-challenge cards with hints, completion stamps, and
 * reset — the progression surface for long architecting sessions.
 */

import React from 'react';
import { Trophy, CheckCircle, Circle, RotateCcw } from 'lucide-react';
import { ChallengeDefinition, ChallengeState } from '../simulation/challenges';

interface MissionsPanelProps {
  definitions: ChallengeDefinition[];
  states: ChallengeState[];
  onClose: () => void;
  onReset: () => void;
}

export const MissionsPanel: React.FC<MissionsPanelProps> = ({
  definitions,
  states,
  onClose,
  onReset,
}) => {
  const completed = states.filter((s) => s.completed).length;
  const total = definitions.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const byId = new Map(states.map((s) => [s.id, s]));

  return (
    <aside className="missions-panel hud-interactive" aria-label="Architect missions">
      <div className="navigator-header">
        <Trophy size={15} color="#d4a373" />
        <span className="navigator-title">Architect Missions</span>
        <span className="navigator-count">
          {completed}/{total}
        </span>
        <button className="navigator-close" onClick={onClose} aria-label="Close missions">
          ×
        </button>
      </div>
      <div className="missions-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="missions-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="missions-list">
        {definitions.map((def) => {
          const state = byId.get(def.id);
          const done = state?.completed ?? false;
          return (
            <div key={def.id} className={`mission-card ${done ? 'done' : ''}`}>
              <div className="mission-icon">{done ? <CheckCircle size={16} color="#34d399" /> : <Circle size={16} color="var(--text-muted)" />}</div>
              <div className="mission-body">
                <div className="mission-title">{def.title}</div>
                <div className="mission-desc">{def.description}</div>
                {!done && <div className="mission-hint">Hint: {def.hint}</div>}
                {done && state?.completedAtIso && (
                  <div className="mission-stamp">
                    Completed {new Date(state.completedAtIso).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn-secondary missions-reset" onClick={onReset}>
        <RotateCcw size={13} /> Reset progress
      </button>
    </aside>
  );
};
