/**
 * System statistics dashboard modal (GAME15 presentation layer).
 *
 * Census, energetics, angular momentum, orbital health, habitability,
 * and the composite stability score — the architect's mission-control
 * summary of everything the integrator knows.
 */

import React, { useMemo } from 'react';
import { BarChart3, X } from 'lucide-react';
import { CelestialBody } from '../simulation/types';
import { computeSystemStatistics } from '../simulation/system-stats';
import { formatMass, formatSimTime } from '../simulation/units';
import { useModalA11y } from './modal-a11y';

export interface ArchitectScoreCard {
  score: number;
  band: string;
  breakdown: { missions: number; contracts: number; discovery: number; stability: number };
}

interface SystemStatsModalProps {
  bodies: CelestialBody[];
  simTimeSec: number;
  eventCount: number;
  onClose: () => void;
  /** Composite architect score (iteration 3, GAME14). */
  architect?: ArchitectScoreCard;
}

function StatRow(props: { label: string; value: string; accent?: string }): React.ReactElement {
  return (
    <div className="stats-row">
      <span className="stats-label">{props.label}</span>
      <span className="stats-value" style={props.accent ? { color: props.accent } : undefined}>
        {props.value}
      </span>
    </div>
  );
}

function formatEnergy(joules: number): string {
  const abs = Math.abs(joules);
  if (abs >= 1e30) return `${(joules / 1e30).toFixed(2)} ×10³⁰ J`;
  if (abs >= 1e24) return `${(joules / 1e24).toFixed(2)} ×10²⁴ J`;
  if (abs >= 1e18) return `${(joules / 1e18).toFixed(2)} EJ`;
  if (abs >= 1e12) return `${(joules / 1e12).toFixed(2)} TJ`;
  return `${joules.toExponential(2)} J`;
}

export const SystemStatsModal: React.FC<SystemStatsModalProps> = ({
  bodies,
  simTimeSec,
  eventCount,
  onClose,
  architect,
}) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const stats = useMemo(() => computeSystemStatistics(bodies), [bodies]);

  const scoreColor = stats.stabilityScore >= 75 ? '#34d399' : stats.stabilityScore >= 45 ? '#fbbf24' : '#ff4d64';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="System statistics"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <BarChart3 size={18} color="#0cc6ff" />
          <h3 className="modal-title">System Statistics</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close statistics">
            <X size={16} />
          </button>
        </div>

        <div className="stats-score-band">
          <div className="stats-score-ring" style={{ borderColor: scoreColor }}>
            <span style={{ color: scoreColor }}>{stats.stabilityScore}</span>
          </div>
          <div>
            <div className="stats-score-label">Stability Score</div>
            <div className="stats-score-hint">
              {stats.unboundCount === 0
                ? 'All orbiters bound. The system is dynamically calm.'
                : `${stats.unboundCount} unbound ${stats.unboundCount === 1 ? 'body' : 'bodies'} dragging the score down.`}
            </div>
          </div>
        </div>

        {architect && (
          <div className="stats-architect-band">
            <div className="stats-architect-score">
              <span>{architect.score}</span>
            </div>
            <div>
              <div className="stats-score-label">{architect.band}</div>
              <div className="stats-score-hint">
                Missions {architect.breakdown.missions} · Contracts {architect.breakdown.contracts} ·{' '}
                Discovery {architect.breakdown.discovery} · Stability {architect.breakdown.stability}
              </div>
            </div>
          </div>
        )}

        <div className="settings-section">Census</div>
        <StatRow label="Bodies" value={`${stats.bodyCount}`} />
        <StatRow label="Stars / Black holes" value={`${stats.starCount} / ${stats.blackHoleCount}`} />
        <StatRow label="Planets / Moons / Stations" value={`${stats.planetCount} / ${stats.moonCount} / ${stats.stationCount}`} />
        <StatRow label="Rings" value={`${stats.ringCount}`} />
        <StatRow label="Temperate worlds" value={`${stats.temperateCount}`} accent="#34d399" />

        <div className="settings-section">Energetics</div>
        <StatRow label="Total mass" value={formatMass(stats.totalMassKg)} />
        <StatRow label="Kinetic energy" value={formatEnergy(stats.totalKineticEnergyJ)} />
        <StatRow label="Potential energy" value={formatEnergy(stats.totalPotentialEnergyJ)} />
        <StatRow label="Total energy" value={formatEnergy(stats.totalEnergyJ)} accent={stats.totalEnergyJ < 0 ? '#34d399' : '#fbbf24'} />

        <div className="settings-section">Session</div>
        <StatRow label="Orbits bound / escaping" value={`${stats.boundCount} / ${stats.unboundCount}`} />
        <StatRow label="Widest bound orbit" value={`${stats.widestOrbitAu.toFixed(2)} AU`} />
        <StatRow label="Simulated time" value={formatSimTime(simTimeSec)} />
        <StatRow label="Ledger events" value={`${eventCount}`} />

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
