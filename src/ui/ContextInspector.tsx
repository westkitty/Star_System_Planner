import React from 'react';
import { CelestialBody } from '../simulation/types';
import { formatDistance, formatMass, formatRadius, formatVelocity, formatSimTime } from '../simulation/units';
import { calculateOsculatingElements, detectResonance } from '../simulation/orbital-mechanics';
import { Trash2, Focus, Move, Sparkles } from 'lucide-react';

interface ContextInspectorProps {
  selectedBody: CelestialBody | null;
  allBodies: CelestialBody[];
  onUpdateBody: (body: CelestialBody) => void;
  onDeleteBody: (id: string) => void;
  onFocusBody: (id: string) => void;
  onStartGrabThrow: (body: CelestialBody) => void;
  onOpenCanonMacro: (macroId: string) => void;
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  selectedBody,
  allBodies,
  onUpdateBody,
  onDeleteBody,
  onFocusBody,
  onStartGrabThrow,
  onOpenCanonMacro,
}) => {
  if (!selectedBody) return null;

  // Find primary
  const primary = selectedBody.primaryId
    ? allBodies.find(b => b.id === selectedBody.primaryId)
    : allBodies.find(b => b.id !== selectedBody.id && b.type === 'star') || null;

  const elements = primary ? calculateOsculatingElements(selectedBody, primary) : null;

  // Check resonance with sibling bodies orbiting same primary
  let resonanceText: string | null = null;
  if (primary && elements && elements.periodSec > 0) {
    const siblings = allBodies.filter(b => b.id !== selectedBody.id && b.id !== primary.id);
    for (const sib of siblings) {
      const sibElem = calculateOsculatingElements(sib, primary);
      if (sibElem && sibElem.periodSec > 0) {
        const res = detectResonance(elements.periodSec, sibElem.periodSec);
        if (res) {
          resonanceText = `${res.ratioName} Resonance with ${sib.name} (${res.differencePercent.toFixed(1)}% delta)`;
          break;
        }
      }
    }
  }

  // Speed magnitude
  const currentSpeed = Math.hypot(selectedBody.velocity.x, selectedBody.velocity.y, selectedBody.velocity.z);

  return (
    <div className="right-inspector-panel hud-interactive">
      {/* Header */}
      <div className="inspector-header">
        <div>
          <input
            className="body-name-input"
            value={selectedBody.name}
            onChange={(e) => onUpdateBody({ ...selectedBody, name: e.target.value })}
            title="Tap to rename celestial body"
          />
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
            {selectedBody.type} {selectedBody.classification ? `• ${selectedBody.classification}` : ''}
            {selectedBody.plannerClassification ? ` • ${selectedBody.plannerClassification}` : ''}
          </div>
          {selectedBody.unauthored_in_source && (
            <div style={{ fontSize: '9px', color: '#ffaa00', background: 'rgba(255, 170, 0, 0.12)', padding: '2px 6px', borderRadius: '3px', marginTop: '4px', border: '1px solid rgba(255, 170, 0, 0.3)', display: 'inline-block', fontWeight: 600 }}>
              UNAUTHORED COORDINATES — DEMO ORBIT
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onFocusBody(selectedBody.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
            title="Focus Camera"
          >
            <Focus size={16} />
          </button>
          <button
            onClick={() => onDeleteBody(selectedBody.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ff4d64',
              cursor: 'pointer',
              padding: '4px',
            }}
            title="Delete Body"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Resonance Alert Banner if detected */}
      {resonanceText && (
        <div style={{
          background: 'rgba(12, 198, 255, 0.12)',
          border: '1px solid var(--accent-azure)',
          borderRadius: '6px',
          padding: '6px 10px',
          fontSize: '11px',
          color: 'var(--accent-cyan)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Sparkles size={14} />
          <span>{resonanceText}</span>
        </div>
      )}

      {/* Tactile Properties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Mass Scrubber */}
        <div className="scrubber-row">
          <div className="scrubber-label">
            <span>Mass</span>
            <span className="scrubber-value">{formatMass(selectedBody.massKg)}</span>
          </div>
          <input
            type="range"
            className="tactile-slider"
            min="20"
            max="31"
            step="0.05"
            value={Math.log10(Math.max(1e20, selectedBody.massKg))}
            onChange={(e) => onUpdateBody({ ...selectedBody, massKg: Math.pow(10, parseFloat(e.target.value)) })}
          />
        </div>

        {/* Radius Scrubber */}
        <div className="scrubber-row">
          <div className="scrubber-label">
            <span>Radius</span>
            <span className="scrubber-value">{formatRadius(selectedBody.radiusKm)}</span>
          </div>
          <input
            type="range"
            className="tactile-slider"
            min="2"
            max="6"
            step="0.02"
            value={Math.log10(Math.max(100, selectedBody.radiusKm))}
            onChange={(e) => onUpdateBody({ ...selectedBody, radiusKm: Math.pow(10, parseFloat(e.target.value)) })}
          />
        </div>

        {/* Velocity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Velocity</span>
          <span style={{ color: 'var(--text-primary)' }}>{formatVelocity(currentSpeed)}</span>
        </div>

        {/* Temperature */}
        {selectedBody.temperatureK !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Equilibrium Temp</span>
            <span style={{ color: selectedBody.temperatureK > 400 ? '#ff8844' : selectedBody.temperatureK < 200 ? '#49e7ff' : '#44ee88' }}>
              {selectedBody.temperatureK} K ({Math.round(selectedBody.temperatureK - 273.15)}°C)
            </span>
          </div>
        )}
      </div>

      {/* Osculating Keplerian Parameters Panel */}
      {elements && (
        <div style={{
          background: 'rgba(3, 5, 10, 0.6)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            OSCULATING ORBIT (REL TO {primary?.name.toUpperCase()})
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Semi-Major Axis</div>
              <div style={{ color: 'var(--text-primary)' }}>{formatDistance(elements.semiMajorAxisKm)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Eccentricity</div>
              <div style={{ color: elements.eccentricity > 0.6 ? '#ffaa00' : 'var(--text-primary)' }}>
                {elements.eccentricity.toFixed(3)}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Periapsis</div>
              <div style={{ color: 'var(--text-primary)' }}>{formatDistance(elements.periapsisKm)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Apoapsis</div>
              <div style={{ color: 'var(--text-primary)' }}>
                {Number.isFinite(elements.apoapsisKm) ? formatDistance(elements.apoapsisKm) : 'Hyperbolic'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Period</div>
              <div style={{ color: 'var(--text-primary)' }}>
                {Number.isFinite(elements.periodSec) ? formatSimTime(elements.periodSec) : 'Unbound'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Status</div>
              <div style={{ color: elements.isBound ? '#0cc6ff' : '#ff4d64' }}>
                {elements.isBound ? 'BOUND' : 'ESCAPE'}
              </div>
            </div>
          </div>

          {/* Hill Sphere & Roche Limit */}
          {elements.hillRadiusKm && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid rgba(12, 198, 255, 0.1)', paddingTop: '4px', marginTop: '2px' }}>
              Hill Sphere: {formatDistance(elements.hillRadiusKm)}
              {elements.rocheLimitKm ? ` • Roche Limit: ${formatDistance(elements.rocheLimitKm)}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Signature Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        {/* Grab & Throw */}
        <button
          onClick={() => onStartGrabThrow(selectedBody)}
          style={{
            background: 'rgba(12, 198, 255, 0.12)',
            border: '1px solid var(--accent-azure)',
            color: 'var(--accent-azure)',
            padding: '8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          title="Drag and throw this body into space"
        >
          <Move size={14} />
          GRAB & THROW
        </button>

        {/* Canon Actions */}
        {selectedBody.type === 'star' && (
          <button
            onClick={() => onOpenCanonMacro('pull-starsilk')}
            style={{
              background: '#03050a',
              border: '1px solid #0cc6ff',
              color: '#0cc6ff',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} />
            PULL STARSILK (CANON MACRO)
          </button>
        )}

        {selectedBody.type === 'planet' && (
          <button
            onClick={() => onOpenCanonMacro('spawn-blood-ring')}
            style={{
              background: '#03050a',
              border: '1px solid #880010',
              color: '#ff4d64',
              padding: '8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            CONSTRUCT BLOOD RING
          </button>
        )}
      </div>
    </div>
  );
};
