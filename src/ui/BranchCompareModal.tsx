import React, { useState } from 'react';
import { TimelineBranch } from '../branching/branch-types';
import { BranchManager } from '../branching/branch-manager';
import { formatSimTime, formatDistance, formatVelocity } from '../simulation/units';
import { X, GitCompare } from 'lucide-react';

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
  const [branchAId, setBranchAId] = useState(branches[0]?.id || '');
  const [branchBId, setBranchBId] = useState(branches[1]?.id || branches[0]?.id || '');

  const comparison = branchManager.compareBranches(branchAId, branchBId);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(3, 5, 10, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="hud-interactive"
    >
      <div style={{
        background: '#07131e',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding: '18px',
        width: '460px',
        maxWidth: '90vw',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitCompare size={16} color="#0cc6ff" />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
              CAUSAL BRANCH COMPARISON
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
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

        {/* Comparison Output */}
        {comparison && (
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

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Energy Delta:</span>
              <span style={{ color: Math.abs(comparison.energyDeltaJoules) > 1e25 ? '#ffaa00' : 'var(--accent-azure)' }}>
                {comparison.energyDeltaJoules === 0 ? '—'
                  : `${comparison.energyDeltaJoules >= 0 ? '+' : ''}${comparison.energyDeltaJoules.toExponential(2)} J`}
              </span>
            </div>
          </div>
        )}

        {/* Per-body orbital shift matrix */}
        {comparison && comparison.bodyDeltas.length > 0 && (
          <div style={{
            background: 'rgba(3, 5, 10, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px',
            maxHeight: '32vh',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--accent-azure)', marginBottom: '8px' }}>
              ORBITAL SHIFT MATRIX — Δa / Δe / Δv (shared bodies)
            </div>
            {comparison.bodyDeltas
              .slice()
              .sort((x, y) => Math.abs(y.deltaVelocityKmS) - Math.abs(x.deltaVelocityKmS))
              .map(d => {
                const significant = Math.abs(d.deltaEccentricity) > 0.005 || Math.abs(d.deltaVelocityKmS) > 0.05;
                return (
                  <div
                    key={d.bodyId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: '10px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      padding: '4px 0',
                      borderBottom: '1px solid rgba(12, 198, 255, 0.06)',
                      color: significant ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span>{d.deltaSemiMajorAxisKm === 0 ? '0' : `${d.deltaSemiMajorAxisKm >= 0 ? '+' : ''}${formatDistance(Math.abs(d.deltaSemiMajorAxisKm))}`.replace('-', '−')}</span>
                    <span>{`${d.deltaEccentricity >= 0 ? '+' : ''}${d.deltaEccentricity.toFixed(3)}`}</span>
                    <span>{`${d.deltaVelocityKmS >= 0 ? '+' : ''}${formatVelocity(Math.abs(d.deltaVelocityKmS))}`.replace('-', '−')}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};
