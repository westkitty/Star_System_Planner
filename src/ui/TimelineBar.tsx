import React from 'react';
import { Play, Pause, GitFork, ListOrdered, GitCompare } from 'lucide-react';
import { formatSimTime } from '../simulation/units';
import { TimelineBranch } from '../branching/branch-types';

interface TimelineBarProps {
  timeSec: number;
  timeScale: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onSetTimeScale: (scale: number) => void;
  branches: TimelineBranch[];
  activeBranchId: string;
  onSwitchBranch: (id: string) => void;
  onForkBranch: () => void;
  onOpenLedger: () => void;
  onOpenBranchCompare: () => void;
  eventCount: number;
}

const PRESET_RATES = [1, 10, 100, 1000, 10000];

export const TimelineBar: React.FC<TimelineBarProps> = ({
  timeSec,
  timeScale,
  isPaused,
  onTogglePause,
  onSetTimeScale,
  branches,
  activeBranchId,
  onSwitchBranch,
  onForkBranch,
  onOpenLedger,
  onOpenBranchCompare,
  eventCount,
}) => {
  return (
    <footer className="bottom-timeline-bar hud-interactive">
      {/* Time Play / Rate Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePause}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isPaused ? 'rgba(7, 19, 30, 0.9)' : 'var(--accent-azure)',
            color: isPaused ? 'var(--text-primary)' : '#03050a',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
        >
          {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
        </button>

        {/* Preset Rate Buttons */}
        <div className="time-rate-group">
          {PRESET_RATES.map((rate) => (
            <button
              key={rate}
              className={`rate-btn ${!isPaused && timeScale === rate ? 'active' : ''}`}
              onClick={() => {
                if (isPaused) onTogglePause();
                onSetTimeScale(rate);
              }}
            >
              {rate.toLocaleString()}×
            </button>
          ))}
        </div>

        {/* Elapsed Sim Time */}
        <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>T+ </span>
          <span style={{ color: 'var(--accent-azure)', fontWeight: 600 }}>{formatSimTime(timeSec)}</span>
        </div>
      </div>

      {/* Branch & Event Ledger Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Branch Selector Dropdown */}
        <select
          value={activeBranchId}
          onChange={(e) => onSwitchBranch(e.target.value)}
          style={{
            background: 'rgba(7, 19, 30, 0.9)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            padding: '6px 10px',
            borderRadius: '6px',
            outline: 'none',
            cursor: 'pointer',
          }}
          title="Active Timeline Branch"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({formatSimTime(b.snapshot.timestampSec)})
            </option>
          ))}
        </select>

        {/* FORK FUTURE Button */}
        <button
          onClick={onForkBranch}
          style={{
            background: 'rgba(12, 198, 255, 0.15)',
            border: '1px solid var(--accent-azure)',
            color: 'var(--accent-azure)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
          }}
          title="Fork Future: Branch into an alternate causal timeline"
        >
          <GitFork size={13} />
          FORK FUTURE
        </button>

        {/* Compare Branches Button (if > 1 branch) */}
        {branches.length > 1 && (
          <button
            onClick={onOpenBranchCompare}
            style={{
              background: 'rgba(7, 19, 30, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Compare Causal Consequences Between Branches"
          >
            <GitCompare size={13} />
            DIFF
          </button>
        )}

        {/* Event Ledger Button */}
        <button
          onClick={onOpenLedger}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
          title="Open Causal Event Ledger"
        >
          <ListOrdered size={14} />
          <span>LEDGER ({eventCount})</span>
        </button>
      </div>
    </footer>
  );
};
