import React from 'react';
import { FittedOrbit } from '../interaction/orbit-loom';
import { CelestialBody } from '../simulation/types';
import { KM_PER_AU } from '../simulation/units';
import { Check, X, Disc, Globe, Layers } from 'lucide-react';

interface OrbitLoomConfirmModalProps {
  fittedOrbit: FittedOrbit;
  primaryBody: CelestialBody | null;
  selectedBody: CelestialBody | null;
  allBodies: CelestialBody[];
  onApplyToBody: (targetBody: CelestialBody) => void;
  onCreateRing: () => void;
  onCreateBelt: (name: string, particleCount: number) => void;
  onScrubPeriapsis: (km: number) => void;
  onScrubApoapsis: (km: number) => void;
  onScrubInclination: (deg: number) => void;
  onCancel: () => void;
}

export const OrbitLoomConfirmModal: React.FC<OrbitLoomConfirmModalProps> = ({
  fittedOrbit,
  primaryBody,
  selectedBody,
  allBodies,
  onApplyToBody,
  onCreateRing,
  onCreateBelt,
  onScrubPeriapsis,
  onScrubApoapsis,
  onScrubInclination,
  onCancel,
}) => {
  const semiMajorAu = fittedOrbit.semiMajorAxisKm / KM_PER_AU;
  const periAu = fittedOrbit.periapsisKm / KM_PER_AU;
  const apoAu = fittedOrbit.apoapsisKm / KM_PER_AU;
  const periodDays = fittedOrbit.periodSec / 86400;

  // Potential target body for applying orbit
  const canApplyToSelected = selectedBody && primaryBody && selectedBody.id !== primaryBody.id;
  const eligibleBodies = allBodies.filter(b => b.id !== primaryBody?.id && b.type !== 'star');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '84px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(540px, 92vw)',
        background: 'rgba(3, 8, 16, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-focus)',
        borderRadius: '10px',
        padding: '16px',
        zIndex: 40,
        boxShadow: '0 8px 32px rgba(12, 198, 255, 0.25)',
      }}
      className="hud-interactive"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0cc6ff', boxShadow: '0 0 8px #0cc6ff' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#0cc6ff' }}>
            ORBIT LOOM — CONIC FIT CONFIRMATION
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          title="Cancel fitted orbit"
        >
          <X size={16} />
        </button>
      </div>

      {/* Calculated Keplerian Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '14px',
          background: 'rgba(6, 16, 25, 0.8)',
          padding: '10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)' }}>PRIMARY</span>
          <div style={{ color: '#fff', fontWeight: 600 }}>{primaryBody?.name || 'Unknown Primary'}</div>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>SEMI-MAJOR (a)</span>
          <div style={{ color: '#49e7ff', fontWeight: 600 }}>{semiMajorAu.toFixed(3)} AU</div>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>ECCENTRICITY (e)</span>
          <div style={{ color: '#49e7ff', fontWeight: 600 }}>{fittedOrbit.eccentricity.toFixed(3)}</div>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>PERIAPSIS</span>
          <div style={{ color: '#00ffcc' }}>{periAu.toFixed(3)} AU</div>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>APOAPSIS</span>
          <div style={{ color: '#ffaa00' }}>{apoAu.toFixed(3)} AU</div>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>PERIOD</span>
          <div style={{ color: '#fff' }}>
            {periodDays > 365 ? `${(periodDays / 365.25).toFixed(2)} yr` : `${periodDays.toFixed(1)} d`}
          </div>
        </div>
      </div>

      {/* Live scrubbers — reshape the conic in place, the preview follows */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '2px' }}>
          LIVE CONIC SCULPTING
        </div>
        <div className="loom-scrub">
          <span className="field-label">Periapsis</span>
          <input
            type="range"
            min={fittedOrbit.periapsisKm * 0.35}
            max={fittedOrbit.apoapsisKm * 0.98}
            step={fittedOrbit.periapsisKm * 0.005}
            defaultValue={fittedOrbit.periapsisKm}
            onChange={(e) => onScrubPeriapsis(Number(e.target.value))}
          />
          <span className="setting-value">{(fittedOrbit.periapsisKm / KM_PER_AU).toFixed(3)} AU</span>
        </div>
        <div className="loom-scrub">
          <span className="field-label">Apoapsis</span>
          <input
            type="range"
            min={fittedOrbit.periapsisKm * 1.02}
            max={fittedOrbit.apoapsisKm * 2.6}
            step={fittedOrbit.apoapsisKm * 0.005}
            defaultValue={fittedOrbit.apoapsisKm}
            onChange={(e) => onScrubApoapsis(Number(e.target.value))}
          />
          <span className="setting-value">{(fittedOrbit.apoapsisKm / KM_PER_AU).toFixed(3)} AU</span>
        </div>
        <div className="loom-scrub">
          <span className="field-label">Inclination</span>
          <input
            type="range"
            min={-90}
            max={90}
            step={1}
            defaultValue={fittedOrbit.inclinationDeg}
            onChange={(e) => onScrubInclination(Number(e.target.value))}
          />
          <span className="setting-value">{fittedOrbit.inclinationDeg.toFixed(0)}°</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {canApplyToSelected ? (
          <button
            onClick={() => onApplyToBody(selectedBody)}
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '8px 12px',
              background: 'linear-gradient(135deg, rgba(12, 198, 255, 0.3) 0%, rgba(12, 198, 255, 0.15) 100%)',
              border: '1px solid #0cc6ff',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Check size={14} color="#0cc6ff" />
            APPLY TO {selectedBody.name.toUpperCase()}
          </button>
        ) : eligibleBodies.length > 0 ? (
          <select
            onChange={(e) => {
              const body = eligibleBodies.find(b => b.id === e.target.value);
              if (body) onApplyToBody(body);
            }}
            defaultValue=""
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '8px 10px',
              background: 'rgba(10, 42, 68, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: '#49e7ff',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>
              APPLY TO BODY...
            </option>
            {eligibleBodies.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
        ) : (
          <button
            disabled
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Globe size={14} />
            NO ELIGIBLE SATELLITE
          </button>
        )}

        <button
          onClick={() => onCreateBelt(`Belt of ${primaryBody?.name || 'the Primary'}`, 900)}
          style={{
            flex: 1,
            minWidth: '150px',
            padding: '8px 12px',
            background: 'rgba(10, 42, 68, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          title="Seed this conic as 900 instanced debris particles on Keplerian paths"
        >
          <Layers size={14} color="#ffaa00" />
          SEED DEBRIS BELT
        </button>

        <button
          onClick={onCreateRing}
          style={{
            flex: 1,
            minWidth: '150px',
            padding: '8px 12px',
            background: 'rgba(10, 42, 68, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Disc size={14} color="#49e7ff" />
          CREATE ORBITAL RING
        </button>

        <button
          onClick={onCancel}
          style={{
            padding: '8px 14px',
            background: 'rgba(255, 77, 100, 0.12)',
            border: '1px solid rgba(255, 77, 100, 0.3)',
            borderRadius: '6px',
            color: '#ff4d64',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
};
