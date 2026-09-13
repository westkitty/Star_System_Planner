/**
 * Guided-challenge missions panel (GAME14 presentation layer).
 *
 * Progress ring, tiered challenge cards with hints, completion stamps,
 * scenario contracts, the gravity-assist debrief (GAME02 iteration 3),
 * the discovery codex shelf (GAME07 iteration 3), and reset — the
 * progression surface for long architecting sessions.
 */

import React, { useMemo, useState } from 'react';
import { Trophy, CheckCircle, Circle, RotateCcw, Rocket, Sparkles } from 'lucide-react';
import { ChallengeDefinition, ChallengeState, ChallengeTier, TIER_ORDER } from '../simulation/challenges';
import { AssistEvent } from '../simulation/gravity-assists';
import { CodexEntry, DISCOVERY_LABELS } from '../simulation/discovery-codex';

export interface ContractCardState {
  id: string;
  title: string;
  brief: string;
  progress: string;
  done: boolean;
}

export interface MissionDebrief {
  best: { deltaVKmS: number; label: string };
  recent: AssistEvent[];
  onReset: () => void;
}

export interface MissionCodex {
  entries: CodexEntry[];
  onReset: () => void;
}

interface MissionsPanelProps {
  definitions: ChallengeDefinition[];
  states: ChallengeState[];
  onClose: () => void;
  onReset: () => void;
  contracts?: ContractCardState[];
  onResetContracts?: () => void;
  debrief?: MissionDebrief;
  codex?: MissionCodex;
}

type StatusFilter = 'all' | 'active' | 'done';
type SortMode = 'tier' | 'title' | 'status';

export const MissionsPanel: React.FC<MissionsPanelProps> = ({
  definitions,
  states,
  onClose,
  onReset,
  contracts,
  onResetContracts,
  debrief,
  codex,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('tier');
  const completed = states.filter((s) => s.completed).length;
  const total = definitions.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const byId = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const filtered = useMemo(() => {
    const list = definitions.filter((def) => {
      const done = byId.get(def.id)?.completed ?? false;
      if (statusFilter === 'active' && done) return false;
      if (statusFilter === 'done' && !done) return false;
      return true;
    });
    const tierRank = (t: ChallengeTier): number => TIER_ORDER.indexOf(t);
    return [...list].sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title);
      if (sortMode === 'status') {
        const da = byId.get(a.id)?.completed ? 1 : 0;
        const db = byId.get(b.id)?.completed ? 1 : 0;
        return da - db || a.title.localeCompare(b.title);
      }
      return tierRank(a.tier) - tierRank(b.tier) || a.title.localeCompare(b.title);
    });
  }, [definitions, byId, statusFilter, sortMode]);

  const renderCard = (def: ChallengeDefinition): React.ReactNode => {
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
  };

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
      <div className="missions-controls">
        <div className="missions-filter-chips" role="group" aria-label="Filter missions by status">
          {(['all', 'active', 'done'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              className={`filter-chip ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
              aria-pressed={statusFilter === f}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Done'}
            </button>
          ))}
        </div>
        <select
          className="missions-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          aria-label="Sort missions"
        >
          <option value="tier">Tier order</option>
          <option value="title">Title A–Z</option>
          <option value="status">Active first</option>
        </select>
      </div>
      <div className="missions-list">
        {sortMode === 'tier' ? (
          TIER_ORDER.map((tier) => {
            const inTier = filtered.filter((d) => d.tier === tier);
            if (inTier.length === 0) return null;
            const doneCount = inTier.filter((d) => byId.get(d.id)?.completed).length;
            return (
              <div key={tier} className="missions-tier">
                <div className="missions-tier-head">
                  <span className={`tier-name tier-${tier.toLowerCase()}`}>{tier}</span>
                  <span className="tier-count">{doneCount}/{inTier.length}</span>
                </div>
                {inTier.map(renderCard)}
              </div>
            );
          })
        ) : (
          filtered.map(renderCard)
        )}
        {filtered.length === 0 && (
          <div className="missions-empty">No missions match this filter.</div>
        )}
      </div>
      {contracts && contracts.length > 0 && (
        <>
          <div className="contracts-title">Scenario contracts</div>
          <div className="missions-list contracts-list">
            {contracts.map((c) => (
              <div key={c.id} className={`mission-card contract ${c.done ? 'done' : ''}`}>
                <div className="mission-icon">
                  {c.done ? <CheckCircle size={16} color="#34d399" /> : <Circle size={16} color="#d4a373" />}
                </div>
                <div className="mission-body">
                  <div className="mission-title">{c.title}</div>
                  <div className="mission-desc">{c.brief}</div>
                  <div className="mission-hint">{c.progress}</div>
                </div>
              </div>
            ))}
          </div>
          {onResetContracts && (
            <button className="btn-secondary missions-reset" onClick={onResetContracts}>
              <RotateCcw size={13} /> Reset contracts
            </button>
          )}
        </>
      )}
      {debrief && (
        <>
          <div className="contracts-title">
            <Rocket size={13} /> Slingshot debrief
          </div>
          <div className="debrief-strip">
            {debrief.best.deltaVKmS > 0 ? (
              <>
                <div className="debrief-best">
                  Best: +{debrief.best.deltaVKmS.toFixed(2)} km/s · {debrief.best.label}
                </div>
                {debrief.recent.slice(0, 5).map((a) => (
                  <div key={a.id} className="debrief-row">
                    <span>+{a.deltaVKmS.toFixed(2)} km/s</span>
                    <span className="debrief-route">{a.title.replace('Gravity assist: ', '')}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="debrief-empty">No measured slingshots yet — skim a craft past a planet.</div>
            )}
          </div>
          <button className="btn-secondary missions-reset" onClick={debrief.onReset}>
            <RotateCcw size={13} /> Reset debrief
          </button>
        </>
      )}
      {codex && (
        <>
          <div className="contracts-title">
            <Sparkles size={13} /> Discovery codex · {codex.entries.length}/6
          </div>
          <div className="codex-strip">
            {codex.entries.length === 0 && (
              <div className="debrief-empty">Nothing sighted yet — eclipses, transits, and captures are collected here.</div>
            )}
            {codex.entries.map((e) => (
              <div key={e.kind} className="codex-row" title={`${e.lastLabel} · first seen ${new Date(e.firstSeenIso).toLocaleDateString()}`}>
                <span className="codex-kind">{DISCOVERY_LABELS[e.kind]}</span>
                <span className="codex-count">×{e.count}</span>
              </div>
            ))}
          </div>
          {codex.entries.length > 0 && (
            <button className="btn-secondary missions-reset" onClick={codex.onReset}>
              <RotateCcw size={13} /> Reset codex
            </button>
          )}
        </>
      )}
      <button className="btn-secondary missions-reset" onClick={onReset}>
        <RotateCcw size={13} /> Reset progress
      </button>
    </aside>
  );
};
