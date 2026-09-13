import React, { useState } from 'react';
import { TimelineBranch } from '../branching/branch-types';
import { BranchManager } from '../branching/branch-manager';
import { formatSimTime } from '../simulation/units';
import { X, GitCompare, GitFork } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

interface BranchCompareModalProps {
  branches: TimelineBranch[];
  branchManager: BranchManager;
  onClose: () => void;
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
      </div>
    </div>
  );
};
