/**
 * Bottom timeline transport bar (UI13 continuous time control).
 *
 * Play/pause, single-step advance (GAME01), logarithmic acceleration
 * slider across six orders of magnitude, mission-clock readout, follow /
 * top-down camera modes (GAME02/03), and branch + ledger controls.
 */

import React from 'react';
import { Play, Pause, GitFork, ListOrdered, GitCompare, StepForward, Video, Map, History, Radio } from 'lucide-react';
import { formatMissionClock, formatSimTime } from '../simulation/units';
import { TimelineBranch } from '../branching/branch-types';

interface TimelineBarProps {
  timeSec: number;
  timeScale: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onSetTimeScale: (scale: number) => void;
  onStepOnce: () => void;
  followEnabled: boolean;
  onToggleFollow: () => void;
  topDownEnabled: boolean;
  onToggleTopDown: () => void;
  branches: TimelineBranch[];
  activeBranchId: string;
  onSwitchBranch: (id: string) => void;
  onForkBranch: () => void;
  onOpenLedger: () => void;
  onOpenBranchCompare: () => void;
  eventCount: number;
  /** Divergence % per branch id vs the prime branch (GAME14). */
  divergenceByBranch?: Record<string, number>;
  /** Snapshot ring-buffer scrub state (UI03). */
  scrub?: {
    size: number;
    index: number;
    oldestTimeSec: number | null;
    newestTimeSec: number | null;
    scrubbing: boolean;
    onScrub: (index: number) => void;
    onResumeLive: () => void;
  };
}

const MIN_LOG = 0; // 10^0 = 1×
const MAX_LOG = 5; // 10^5 = 100,000×
const PRESET_RATES = [1, 100, 10000];

function scaleToSlider(scale: number): number {
  return Math.max(MIN_LOG, Math.min(MAX_LOG, Math.log10(Math.max(1, scale))));
}

function sliderToScale(value: number): number {
  const raw = Math.pow(10, value);
  // Snap near powers of ten for stable detents.
  const snapped = Math.pow(10, Math.round(value));
  return Math.abs(raw - snapped) / snapped < 0.12 ? snapped : Math.round(raw);
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  timeSec,
  timeScale,
  isPaused,
  onTogglePause,
  onSetTimeScale,
  onStepOnce,
  followEnabled,
  onToggleFollow,
  topDownEnabled,
  onToggleTopDown,
  branches,
  activeBranchId,
  onSwitchBranch,
  onForkBranch,
  onOpenLedger,
  onOpenBranchCompare,
  eventCount,
  divergenceByBranch,
  scrub,
}) => {
  return (
    <footer className="bottom-timeline-bar hud-interactive" aria-label="Simulation transport">
      <div className="timeline-transport">
        <button
          onClick={onTogglePause}
          className={`transport-play ${isPaused ? 'paused' : ''}`}
          title={isPaused ? 'Resume Simulation (Space)' : 'Pause Simulation (Space)'}
          aria-label={isPaused ? 'Resume simulation' : 'Pause simulation'}
        >
          {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
        </button>

        <button
          onClick={onStepOnce}
          className="transport-step"
          title="Advance one physics step (.)"
          aria-label="Step forward one physics step"
        >
          <StepForward size={15} />
        </button>

        <div className="time-scale-cluster">
          <input
            type="range"
            min={MIN_LOG}
            max={MAX_LOG}
            step={0.05}
            value={scaleToSlider(timeScale)}
            onChange={(e) => onSetTimeScale(sliderToScale(parseFloat(e.target.value)))}
            className="time-slider"
            aria-label="Time acceleration"
            title={`Time acceleration: ${timeScale.toLocaleString()}×`}
          />
          <div className="time-rate-group">
            {PRESET_RATES.map((rate) => (
              <button
                key={rate}
                className={`rate-btn ${!isPaused && timeScale === rate ? 'active' : ''}`}
                onClick={() => {
                  if (isPaused) onTogglePause();
                  onSetTimeScale(rate);
                }}
                title={`${rate.toLocaleString()}× speed`}
              >
                {rate >= 1000 ? `${rate / 1000}k×` : `${rate}×`}
              </button>
            ))}
          </div>
        </div>

        <div className="mission-clock" title={formatMissionClock(timeSec)}>
          <span className="mission-clock-scale">{isPaused ? 'HELD' : `${timeScale.toLocaleString()}×`}</span>
          <span className="mission-clock-time">{formatSimTime(timeSec)}</span>
        </div>

        {scrub && scrub.size > 1 && (
          <div className="time-scrub" title="Rewind recent history (snapshots every 5 sim-seconds)">
            <History size={13} color={scrub.scrubbing ? '#ffd166' : 'var(--text-muted)'} />
            <input
              type="range"
              min={0}
              max={scrub.size - 1}
              step={1}
              value={scrub.scrubbing ? scrub.index : scrub.size - 1}
              onChange={(e) => scrub.onScrub(Number(e.target.value))}
              className="scrub-slider"
              aria-label="Scrub recent history"
            />
            {scrub.scrubbing ? (
              <button className="scrub-live" onClick={scrub.onResumeLive} title="Return to the live frontier">
                <Radio size={12} /> LIVE
              </button>
            ) : (
              <span className="scrub-hint">rewind</span>
            )}
          </div>
        )}

        <div className="camera-modes">
          <button
            onClick={onToggleFollow}
            className={`camera-mode-btn ${followEnabled ? 'active' : ''}`}
            title="Follow selected body (Shift+F)"
            aria-pressed={followEnabled}
          >
            <Video size={13} />
            FOLLOW
          </button>
          <button
            onClick={onToggleTopDown}
            className={`camera-mode-btn ${topDownEnabled ? 'active' : ''}`}
            title="Top-down tactical view (T)"
            aria-pressed={topDownEnabled}
          >
            <Map size={13} />
            TOP
          </button>
        </div>
      </div>

      <div className="timeline-branches">
        <select
          value={activeBranchId}
          onChange={(e) => onSwitchBranch(e.target.value)}
          className="branch-select"
          title="Active Timeline Branch"
          aria-label="Active timeline branch"
        >
          {branches.map((b) => {
            const div = divergenceByBranch?.[b.id];
            const tag = div === undefined || div <= 0.5 ? '' : ` Δ${div.toFixed(0)}%`;
            return (
              <option key={b.id} value={b.id}>
                {b.name}
                {tag} ({formatSimTime(b.snapshot.timestampSec)})
              </option>
            );
          })}
        </select>

        <button onClick={onForkBranch} className="fork-btn" title="Fork Future into an alternate causal timeline (B)">
          <GitFork size={13} />
          FORK FUTURE
        </button>

        {branches.length > 1 && (
          <button onClick={onOpenBranchCompare} className="ledger-btn" title="Compare causal consequences between branches">
            <GitCompare size={13} />
            DIFF
          </button>
        )}

        <button onClick={onOpenLedger} className="ledger-btn" title="Open causal event ledger (L)">
          <ListOrdered size={14} />
          <span>LEDGER ({eventCount})</span>
        </button>
      </div>
    </footer>
  );
};
