/**
 * Selected-body context inspector (UI06 collapsible + live sliders).
 *
 * Identity, composition (mass / radius / albedo / greenhouse with instant
 * thermal feedback), osculating orbit, flight-dynamics maneuvers
 * (GAME10–12), and signature actions (grab, clone, canon, delete).
 */

import React, { useMemo, useState } from 'react';
import { CelestialBody } from '../simulation/types';
import { formatDistance, formatMass, formatRadius, formatVelocity, formatSimTime, formatDeltaV, KM_PER_AU } from '../simulation/units';
import { calculateOsculatingElements, detectResonance } from '../simulation/orbital-mechanics';
import { escapeMarginKmS, NudgeDirection } from '../simulation/maneuvers';
import { assessHabitability } from '../simulation/habitability';
import { estimateTidalLock, formatLockTimescale } from '../simulation/tidal-locking';
import { planHohmann } from '../simulation/transfer-planner';
import { UnitSystem } from '../core/settings';
import { audioSynth } from '../audio/audio-synth';
import { Trash2, Focus, Move, Sparkles, Copy, ChevronDown, Rocket, Crosshair, Anchor, ClipboardCopy, Check, Download, Satellite, Leaf } from 'lucide-react';

interface ContextInspectorProps {
  selectedBody: CelestialBody | null;
  allBodies: CelestialBody[];
  onUpdateBody: (body: CelestialBody) => void;
  onDeleteBody: (id: string) => void;
  onFocusBody: (id: string) => void;
  onStartGrabThrow: (body: CelestialBody) => void;
  onOpenCanonMacro: (macroId: string) => void;
  onCloneBody?: (body: CelestialBody) => void;
  onNudge?: (body: CelestialBody, direction: NudgeDirection, dvKmS: number) => void;
  onCircularize?: (body: CelestialBody) => void;
  onMatchVelocity?: (body: CelestialBody, targetId: string) => void;
  onTransferBurn?: (body: CelestialBody, targetRadiusKm: number) => void;
  onToggleStationKeeping?: (body: CelestialBody) => void;
  onExportEphemeris?: (body: CelestialBody) => void;
  unitSystem?: UnitSystem;
}

function Section(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className="inspector-section">
      <button
        className="inspector-section-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{props.title}</span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && <div className="inspector-section-body">{props.children}</div>}
    </section>
  );
}

const NUDGE_BUTTONS: Array<{ dir: NudgeDirection; label: string; title: string }> = [
  { dir: 'prograde', label: 'PRO', title: 'Prograde burn (raise orbit)' },
  { dir: 'retrograde', label: 'RET', title: 'Retrograde burn (lower orbit)' },
  { dir: 'radial-out', label: 'R+', title: 'Radial-out burn' },
  { dir: 'radial-in', label: 'R−', title: 'Radial-in burn' },
  { dir: 'normal', label: 'N+', title: 'Orbit-normal burn (tilt up)' },
  { dir: 'anti-normal', label: 'N−', title: 'Anti-normal burn (tilt down)' },
];

const VERDICT_COLORS: Record<string, string> = {
  paradise: '#44ee88',
  promising: '#a3e635',
  marginal: '#ffd166',
  hostile: '#ff8844',
  dead: '#ff4d64',
};

function HabitabilitySection(props: {
  body: CelestialBody;
  allBodies: CelestialBody[];
  primary: CelestialBody | null;
}): React.ReactElement | null {
  const report = useMemo(
    () => assessHabitability(props.body, props.allBodies),
    [props.body, props.allBodies]
  );
  if (!report) return null;
  const tidal = props.primary ? estimateTidalLock(props.body, props.primary) : null;
  return (
    <Section title="Habitability" defaultOpen={false}>
      <div className="habit-score-row">
        <span className="habit-score" style={{ color: VERDICT_COLORS[report.verdict] }}>
          {report.score}
        </span>
        <span className="habit-verdict">
          <Leaf size={13} /> {report.verdict.toUpperCase()}
        </span>
      </div>
      {report.factors.map((f) => (
        <div className="kv-row" key={f.label}>
          <span>{f.label}</span>
          <span>
            {f.points}/{f.max}
          </span>
        </div>
      ))}
      {tidal && (
        <div className="kv-row" title="Order-of-magnitude spin-orbit synchronization timescale">
          <span>Tidal lock in</span>
          <span style={{ color: tidal.isLocked ? '#ffd166' : undefined }}>
            {tidal.isLocked ? `LOCKED (${formatLockTimescale(tidal.yearsToLock)})` : formatLockTimescale(tidal.yearsToLock)}
          </span>
        </div>
      )}
    </Section>
  );
}

function TransferSection(props: {
  body: CelestialBody;
  primary: CelestialBody;
  siblings: CelestialBody[];
  onBurn: (body: CelestialBody, targetRadiusKm: number) => void;
}): React.ReactElement {
  const [target, setTarget] = useState<string>('custom');
  const [customAu, setCustomAu] = useState('1.5');
  const options = useMemo(
    () =>
      props.siblings
        .filter((b) => b.id !== props.body.id && b.id !== props.primary.id)
        .map((b) => ({
          id: b.id,
          name: b.name,
          radiusKm: Math.hypot(
            b.position.x - props.primary.position.x,
            b.position.y - props.primary.position.y,
            b.position.z - props.primary.position.z
          ),
        }))
        .filter((o) => o.radiusKm > props.primary.radiusKm),
    [props.siblings, props.body.id, props.primary]
  );
  const targetRadiusKm =
    target === 'custom'
      ? (parseFloat(customAu) || 0) * KM_PER_AU
      : (options.find((o) => o.id === target)?.radiusKm ?? 0);
  const plan = useMemo(
    () => (targetRadiusKm > 0 ? planHohmann(props.body, props.primary, targetRadiusKm) : null),
    [props.body, props.primary, targetRadiusKm]
  );
  return (
    <Section title="Transfer" defaultOpen={false}>
      <div className="rendezvous-row">
        <select
          className="select-input"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Transfer destination"
        >
          <option value="custom">Custom radius…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {(o.radiusKm / KM_PER_AU).toFixed(2)} AU
            </option>
          ))}
        </select>
        {target === 'custom' && (
          <input
            className="select-input"
            value={customAu}
            onChange={(e) => setCustomAu(e.target.value)}
            aria-label="Custom radius in AU"
            inputMode="decimal"
            style={{ maxWidth: '90px' }}
          />
        )}
      </div>
      {plan ? (
        <div className="transfer-plan">
          <div className="kv-row">
            <span>Departure burn</span>
            <span>{formatDeltaV(plan.dv1KmS)}</span>
          </div>
          <div className="kv-row">
            <span>Arrival circularize</span>
            <span>{formatDeltaV(plan.dv2KmS)}</span>
          </div>
          <div className="kv-row">
            <span>Coast time</span>
            <span>{formatSimTime(plan.transferTimeSec)}</span>
          </div>
          <div className="kv-row">
            <span>Total Δv</span>
            <span>{formatDeltaV(plan.totalDvKmS)}</span>
          </div>
          {plan.eccentricDeparture && (
            <div className="transfer-note">Departure orbit is eccentric — planned from current radius.</div>
          )}
          <button
            className="action-btn azure"
            onClick={() => props.onBurn(props.body, plan.targetRadiusKm)}
            title="Execute the departure burn now"
          >
            <Rocket size={14} /> EXECUTE DEPARTURE
          </button>
        </div>
      ) : (
        <div className="transfer-note">Choose a destination orbit to preview the Hohmann leg.</div>
      )}
    </Section>
  );
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  selectedBody,
  allBodies,
  onUpdateBody,
  onDeleteBody,
  onFocusBody,
  onStartGrabThrow,
  onOpenCanonMacro,
  onCloneBody,
  onNudge,
  onCircularize,
  onMatchVelocity,
  onTransferBurn,
  onToggleStationKeeping,
  onExportEphemeris,
  unitSystem,
}) => {
  const [nudgeDv, setNudgeDv] = useState(0.5);
  const [rendezvousTargetId, setRendezvousTargetId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const imperial = unitSystem === 'imperial';

  const fmtDist = (km: number): string =>
    imperial ? `${(km * 0.621371).toLocaleString(undefined, { maximumFractionDigits: 0 })} mi` : formatDistance(km);
  const fmtVel = (kmS: number): string =>
    imperial ? `${(kmS * 2236.94).toLocaleString(undefined, { maximumFractionDigits: 0 })} mph` : formatVelocity(kmS);
  const fmtTemp = (k: number): string =>
    imperial ? `${Math.round((k - 273.15) * 1.8 + 32)}°F` : `${Math.round(k - 273.15)}°C`;

  if (!selectedBody) return null;

  const primary = selectedBody.primaryId
    ? allBodies.find(b => b.id === selectedBody.primaryId)
    : allBodies.find(b => b.id !== selectedBody.id && b.type === 'star') || null;

  const elements = primary ? calculateOsculatingElements(selectedBody, primary) : null;

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

  const currentSpeed = Math.hypot(selectedBody.velocity.x, selectedBody.velocity.y, selectedBody.velocity.z);
  const margin = primary ? escapeMarginKmS(selectedBody, primary) : null;
  const rendezvousTargets = allBodies.filter(b => b.id !== selectedBody.id);
  const effectiveTargetId = rendezvousTargetId || rendezvousTargets[0]?.id || '';

  const tempK = selectedBody.temperatureK ?? 0;
  const tempColor = tempK > 400 ? '#ff8844' : tempK < 200 ? '#49e7ff' : '#44ee88';

  return (
    <div className="right-inspector-panel hud-interactive">
      <div className="inspector-header">
        <div style={{ minWidth: 0 }}>
          <input
            className="body-name-input"
            value={selectedBody.name}
            onChange={(e) => onUpdateBody({ ...selectedBody, name: e.target.value })}
            title="Tap to rename celestial body"
            aria-label="Body name"
            maxLength={48}
          />
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>
            {selectedBody.type} {selectedBody.classification ? `• ${selectedBody.classification}` : ''}
            {selectedBody.plannerClassification ? ` • ${selectedBody.plannerClassification}` : ''}
          </div>
          {selectedBody.unauthored_in_source && (
            <div className="badge-demo-orbit">
              UNAUTHORED COORDINATES — DEMO ORBIT
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onFocusBody(selectedBody.id)}
            className="icon-btn"
            title="Focus Camera (F)"
            aria-label="Focus camera"
          >
            <Focus size={16} />
          </button>
          {onCloneBody && (
            <button
              onClick={() => onCloneBody(selectedBody)}
              className="icon-btn"
              title="Duplicate body"
              aria-label="Duplicate body"
            >
              <Copy size={16} />
            </button>
          )}
          <button
            onClick={() => {
              const payload = {
                name: selectedBody.name,
                type: selectedBody.type,
                massKg: selectedBody.massKg,
                radiusKm: selectedBody.radiusKm,
                temperatureK: selectedBody.temperatureK,
                positionKm: selectedBody.position,
                velocityKmS: selectedBody.velocity,
                primaryId: selectedBody.primaryId ?? null,
              };
              const text = JSON.stringify(payload, null, 2);
              try {
                if (navigator.clipboard) void navigator.clipboard.writeText(text);
              } catch {
                /* clipboard unavailable */
              }
              audioSynth.playSliderTick();
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="icon-btn"
            title="Copy body telemetry as JSON"
            aria-label="Copy telemetry JSON"
          >
            {copied ? <Check size={16} color="#44ee88" /> : <ClipboardCopy size={16} />}
          </button>
          <button
            onClick={() => onDeleteBody(selectedBody.id)}
            className="icon-btn danger"
            title="Delete Body (Delete)"
            aria-label="Delete body"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {resonanceText && (
        <div className="resonance-banner">
          <Sparkles size={14} />
          <span>{resonanceText}</span>
        </div>
      )}

      <Section title="Composition">
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
            aria-label="Body mass"
            value={Math.log10(Math.max(1e20, selectedBody.massKg))}
            onChange={(e) => onUpdateBody({ ...selectedBody, massKg: Math.pow(10, parseFloat(e.target.value)) })}
          />
        </div>

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
            aria-label="Body radius"
            value={Math.log10(Math.max(100, selectedBody.radiusKm))}
            onChange={(e) => onUpdateBody({ ...selectedBody, radiusKm: Math.pow(10, parseFloat(e.target.value)) })}
          />
        </div>

        <div className="scrubber-row">
          <div className="scrubber-label">
            <span>Albedo</span>
            <span className="scrubber-value">{((selectedBody.albedo ?? 0.3) * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            className="tactile-slider"
            min="0"
            max="1"
            step="0.01"
            aria-label="Bond albedo"
            value={selectedBody.albedo ?? 0.3}
            onChange={(e) => onUpdateBody({ ...selectedBody, albedo: parseFloat(e.target.value) })}
          />
        </div>

        <div className="scrubber-row">
          <div className="scrubber-label">
            <span>Greenhouse</span>
            <span className="scrubber-value">+{(selectedBody.greenhouseOffsetK ?? 0).toFixed(0)} K</span>
          </div>
          <input
            type="range"
            className="tactile-slider"
            min="0"
            max="300"
            step="1"
            aria-label="Greenhouse offset"
            value={selectedBody.greenhouseOffsetK ?? 0}
            onChange={(e) => onUpdateBody({ ...selectedBody, greenhouseOffsetK: parseFloat(e.target.value) })}
          />
        </div>

        <div className="kv-row">
          <span>Velocity</span>
          <span>{fmtVel(currentSpeed)}</span>
        </div>
        {selectedBody.temperatureK !== undefined && (
          <div className="kv-row">
            <span>Equilibrium Temp</span>
            <span style={{ color: tempColor }}>
              {selectedBody.temperatureK} K ({fmtTemp(selectedBody.temperatureK)})
            </span>
          </div>
        )}
      </Section>

      <HabitabilitySection body={selectedBody} allBodies={allBodies} primary={primary ?? null} />

      {elements && (
        <Section title={`Orbit · rel ${primary?.name ?? '—'}`}>
          <div className="orbit-grid">
            <div>
              <div className="orbit-label">Semi-Major Axis</div>
              <div className="orbit-value">{fmtDist(elements.semiMajorAxisKm)}</div>
            </div>
            <div>
              <div className="orbit-label">Eccentricity</div>
              <div className="orbit-value" style={{ color: elements.eccentricity > 0.6 ? '#ffaa00' : undefined }}>
                {elements.eccentricity.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="orbit-label">Periapsis</div>
              <div className="orbit-value">{fmtDist(elements.periapsisKm)}</div>
            </div>
            <div>
              <div className="orbit-label">Apoapsis</div>
              <div className="orbit-value">
                {Number.isFinite(elements.apoapsisKm) ? fmtDist(elements.apoapsisKm) : 'Hyperbolic'}
              </div>
            </div>
            <div>
              <div className="orbit-label">Period</div>
              <div className="orbit-value">
                {Number.isFinite(elements.periodSec) ? formatSimTime(elements.periodSec) : 'Unbound'}
              </div>
            </div>
            <div>
              <div className="orbit-label">Status</div>
              <div className="orbit-value" style={{ color: elements.isBound ? '#0cc6ff' : '#ff4d64' }}>
                {elements.isBound ? 'BOUND' : 'ESCAPE'}
              </div>
            </div>
          </div>
          {margin !== null && (
            <div className="kv-row" title="Headroom below escape velocity at current separation">
              <span>Escape margin</span>
              <span style={{ color: margin >= 0 ? '#44ee88' : '#ff4d64' }}>
                {margin >= 0 ? `−${fmtVel(margin)} headroom` : `+${fmtVel(-margin)} over escape`}
              </span>
            </div>
          )}
          {elements.hillRadiusKm && (
            <div className="hill-line">
              Hill Sphere: {fmtDist(elements.hillRadiusKm)}
              {elements.rocheLimitKm ? ` • Roche Limit: ${fmtDist(elements.rocheLimitKm)}` : ''}
            </div>
          )}
        </Section>
      )}

      {primary && onNudge && onCircularize && onMatchVelocity && (
        <Section title="Maneuvers" defaultOpen={false}>
          <div className="scrubber-row">
            <div className="scrubber-label">
              <span>Burn magnitude</span>
              <span className="scrubber-value">{formatDeltaV(nudgeDv)}</span>
            </div>
            <input
              type="range"
              className="tactile-slider"
              min="0.05"
              max="5"
              step="0.05"
              aria-label="Maneuver magnitude"
              value={nudgeDv}
              onChange={(e) => setNudgeDv(parseFloat(e.target.value))}
            />
          </div>
          <div className="nudge-grid">
            {NUDGE_BUTTONS.map((b) => (
              <button
                key={b.dir}
                className="nudge-btn"
                title={b.title}
                onClick={() => onNudge(selectedBody, b.dir, nudgeDv)}
              >
                {b.label}
              </button>
            ))}
          </div>
          <button className="action-btn azure" onClick={() => onCircularize(selectedBody)} title="Rewrite velocity for a circular orbit at current radius">
            <Anchor size={14} /> CIRCULARIZE ORBIT
          </button>
          <div className="rendezvous-row">
            <select
              className="select-input"
              value={effectiveTargetId}
              onChange={(e) => setRendezvousTargetId(e.target.value)}
              aria-label="Rendezvous target"
            >
              {rendezvousTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="action-btn ghost"
              onClick={() => effectiveTargetId && onMatchVelocity(selectedBody, effectiveTargetId)}
              disabled={!effectiveTargetId}
              title="Match the target's inertial velocity"
            >
              <Crosshair size={14} /> RENDEZVOUS
            </button>
          </div>
        </Section>
      )}

      {primary && onTransferBurn && (
        <TransferSection body={selectedBody} primary={primary} siblings={allBodies} onBurn={onTransferBurn} />
      )}

      <Section title="Actions">
        <button className="action-btn azure" onClick={() => onStartGrabThrow(selectedBody)} title="Drag and throw this body into space">
          <Move size={14} /> GRAB & THROW
        </button>
        {(selectedBody.type === 'station' || selectedBody.type === 'ship') && onToggleStationKeeping && (
          <button
            className={`action-btn ${selectedBody.stationKeeping ? 'azure' : 'ghost'}`}
            onClick={() => onToggleStationKeeping(selectedBody)}
            title="Station-keeping autopilot: spend thrust to hold a circular orbit"
            aria-pressed={Boolean(selectedBody.stationKeeping)}
          >
            <Satellite size={14} /> STATION-KEEPING {selectedBody.stationKeeping ? 'ON' : 'OFF'}
          </button>
        )}
        {onExportEphemeris && (
          <button
            className="action-btn ghost"
            onClick={() => onExportEphemeris(selectedBody)}
            title="Sample this body's trajectory forward and download a CSV ephemeris"
          >
            <Download size={14} /> EXPORT EPHEMERIS
          </button>
        )}
        {selectedBody.type === 'star' && (
          <button className="action-btn canon-azure" onClick={() => onOpenCanonMacro('pull-starsilk')}>
            <Sparkles size={14} /> PULL STARSILK (CANON MACRO)
          </button>
        )}
        {selectedBody.type === 'planet' && (
          <button className="action-btn canon-crimson" onClick={() => onOpenCanonMacro('spawn-blood-ring')}>
            <Rocket size={14} /> CONSTRUCT BLOOD RING
          </button>
        )}
      </Section>
    </div>
  );
};
