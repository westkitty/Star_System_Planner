import React, { useMemo, useState } from 'react';
import { TimelineBranch } from '../branching/branch-types';
import { BranchManager } from '../branching/branch-manager';
import { formatSimTime } from '../simulation/units';
import { calculateSystemEnergy } from '../simulation/integrator';
import { X, GitCompare, GitFork } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

/** Center-diverging delta bar: B exceeds A to the right, trails to the left. */
function DeltaBar(props: { label: string; valueA: number; valueB: number; format: (v: number) => string }): React.ReactElement {
  const max = Math.max(Math.abs(props.valueA), Math.abs(props.valueB), 1e-9);
  const aPct = Math.abs(props.valueA / max) * 50;
  const bPct = Math.abs(props.valueB / max) * 50;
  return (
    <div className="delta-row">
      <span className="delta-label">{props.label}</span>
      <span className="delta-val a">{props.format(props.valueA)}</span>
      <span className="delta-track" aria-hidden="true">
        <span className="delta-fill a" style={{ width: `${aPct}%` }} />
        <span className="delta-mid" />
        <span className="delta-fill b" style={{ width: `${bPct}%` }} />
      </span>
      <span className="delta-val b">{props.format(props.valueB)}</span>
    </div>
  );
}

interface BranchCompareModalProps {
  branches: TimelineBranch[];
  branchManager: BranchManager;
  onClose: () => void;
}

function DeltaPanel(props: { branches: TimelineBranch[]; branchAId: string; branchBId: string }): React.ReactElement {
  const stats = useMemo(() => {
    const summarize = (id: string): { bodies: number; mass: number; energy: number; events: number } => {
      const branch = props.branches.find((b) => b.id === id);
      if (!branch) return { bodies: 0, mass: 0, energy: 0, events: 0 };
      const snapshotBodies = branch.snapshot.bodies ?? [];
      return {
        bodies: snapshotBodies.length,
        mass: snapshotBodies.reduce((sum, b) => sum + b.massKg, 0),
        energy: Math.abs(calculateSystemEnergy(snapshotBodies).total),
        events: branch.events.length,
      };
    };
    return { a: summarize(props.branchAId), b: summarize(props.branchBId) };
  }, [props.branches, props.branchAId, props.branchBId]);

  const fmtInt = (v: number): string => String(Math.round(v));
  const fmtSci = (v: number): string =>
    v === 0 ? '0' : `${(v / Math.pow(10, Math.floor(Math.log10(v)))).toFixed(1)}e${Math.floor(Math.log10(v))}`;
  return (
    <div className="delta-panel" aria-label="Branch magnitude comparison">
      <div className="delta-title">Magnitude divergence</div>
      <DeltaBar label="Bodies" valueA={stats.a.bodies} valueB={stats.b.bodies} format={fmtInt} />
      <DeltaBar label="Mass (kg)" valueA={stats.a.mass} valueB={stats.b.mass} format={fmtSci} />
      <DeltaBar label="|Energy| (J)" valueA={stats.a.energy} valueB={stats.b.energy} format={fmtSci} />
      <DeltaBar label="Ledger events" valueA={stats.a.events} valueB={stats.b.events} format={fmtInt} />
    </div>
  );
}

export const BranchCompareModal: React.FC<BranchCompareModalProps> = ({
  branches,
  branchManager,
  onClose,
}) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [branchAId, setBranchAId] = useState(branches[0]?.id || '');
  const [branchBId, setBranchBId] = useState(branches[1]?.id || branches[0]?.id || '');

  const comparison = branchManager.compareBranches(branchAId, branchBId);

  return (
    <div className="modal-backdrop hud-interactive" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Causal branch comparison"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitCompare size={16} color="#0cc6ff" />
            <h3 className="modal-title">
              CAUSAL BRANCH COMPARISON
            </h3>
          </div>
          <button onClick={onClose} className="modal-x" aria-label="Close comparison">
            <X size={16} />
          </button>
        </div>

        {/* Branch Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Base Branch (A)
            </label>
            <select
              value={branchAId}
              onChange={(e) => setBranchAId(e.target.value)}
              style={{
                width: '100%',
                background: '#03050a',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '6px 8px',
                fontSize: '11px',
                outline: 'none',
              }}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Comparison Branch (B)
            </label>
            <select
              value={branchBId}
              onChange={(e) => setBranchBId(e.target.value)}
              style={{
                width: '100%',
                background: '#03050a',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '6px 8px',
                fontSize: '11px',
                outline: 'none',
              }}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Single-branch guidance (UI09 empty state) */}
        {branches.length < 2 && (
          <div className="empty-state">
            <GitFork size={26} color="var(--text-muted)" />
            <div className="empty-state-title">Only one timeline exists</div>
            <div className="empty-state-hint">
              Fork the future from the timeline bar, let the branches diverge, then return here to
              audit the causal consequences side by side.
            </div>
          </div>
        )}

        {/* Comparison Output */}
        {comparison && branches.length >= 2 && (
          <div style={{
            background: 'rgba(3, 5, 10, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Simulation Time Delta:</span>
              <span style={{ color: 'var(--accent-azure)' }}>
                {formatSimTime(Math.abs(comparison.elapsedTimeDiffSec))}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Surviving in Both:</span>
              <span style={{ color: '#44ee88' }}>{comparison.survivingInBothCount} bodies</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Bodies Lost in {comparison.branchBName}:</span>
              <span style={{ color: comparison.bodiesLostInBCount > 0 ? '#ff4d64' : 'var(--text-muted)' }}>
                {comparison.bodiesLostInBCount} bodies
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>New Bodies in {comparison.branchBName}:</span>
              <span style={{ color: comparison.bodiesNewInBCount > 0 ? '#49e7ff' : 'var(--text-muted)' }}>
                {comparison.bodiesNewInBCount} bodies
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Collisions in {comparison.branchBName}:</span>
              <span style={{ color: comparison.collisionsInBCount > 0 ? '#ffaa00' : 'var(--text-muted)' }}>
                {comparison.collisionsInBCount}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Starsilk Interventions in {comparison.branchBName}:</span>
              <span style={{ color: comparison.starsilkMacrosInBCount > 0 ? '#0cc6ff' : 'var(--text-muted)' }}>
                {comparison.starsilkMacrosInBCount}
              </span>
            </div>
          </div>
        )}

        {/* Diverging delta visualization (UI06) */}
        {branches.length >= 2 && (
          <DeltaPanel branches={branches} branchAId={branchAId} branchBId={branchBId} />
        )}
      </div>
    </div>
  );
};
