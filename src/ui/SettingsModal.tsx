/**
 * Consolidated planner settings modal (UI15 + iteration 3 UI06/UI10).
 *
 * Audio (volume + enable), persistence (autosave), rendering (trajectory
 * density, reduced motion), and interface (hints, navigator, follow, HUD
 * density, tour replay) — all persisted and applied live without reload.
 * A quick filter narrows the list as the modal grows.
 */

import React, { useState } from 'react';
import { Settings, RotateCcw, FileDown, Gauge, Clapperboard, Feather, Search } from 'lucide-react';
import { PlannerSettings } from '../core/settings';
import { audioSynth } from '../audio/audio-synth';
import { useModalA11y } from './modal-a11y';

interface SettingsModalProps {
  settings: PlannerSettings;
  onUpdate: (patch: Partial<PlannerSettings>) => void;
  onReset: () => void;
  onReplayTour: () => void;
  onExportDiagnostics?: () => void;
  onClose: () => void;
}

function ToggleRow(props: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {props.label}
        <span className="settings-hint">{props.hint}</span>
      </span>
      <button
        role="switch"
        aria-checked={props.checked}
        className={`switch ${props.checked ? 'on' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          props.onChange(!props.checked);
        }}
      >
        <span className="switch-knob" />
      </button>
    </label>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdate,
  onReset,
  onReplayTour,
  onExportDiagnostics,
  onClose,
}) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (...terms: string[]): boolean => {
    if (!q) return true;
    const hay = terms.join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  };
  const showAudio = matches('audio tactile sound volume music');
  const showPersistence = matches('persistence autosave save storage');
  const showQuality = matches('quality preset cinematic balanced performance overlays gpu');
  const showRendering = matches('rendering trajectory density reduced motion orbit lines body labels au ruler velocity vectors overlays');
  const showInterface = matches('interface hud hints navigator follow select approach autopilot units metric imperial density compact comfortable tour');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Planner settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <Settings size={18} color="#0cc6ff" />
          <h3 className="modal-title">Planner Settings</h3>
        </div>
        <div className="settings-search">
          <Search size={14} color="var(--text-muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter settings…"
            aria-label="Filter settings"
          />
        </div>

        {showAudio && (
          <>
            <div className="settings-section">Audio</div>
            {matches('tactile audio sound enable') && (
              <ToggleRow
                label="Tactile audio"
                hint="Synthesized ticks, chimes, and collapse drones"
                checked={settings.audioEnabled}
                onChange={(v) => onUpdate({ audioEnabled: v })}
              />
            )}
            {matches('volume audio loud') && (
              <label className="settings-row">
                <span className="settings-label">
                  Volume
                  <span className="settings-hint">{Math.round(settings.audioVolume * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.audioVolume * 100)}
                  onChange={(e) => onUpdate({ audioVolume: Number(e.target.value) / 100 })}
                  aria-label="Audio volume"
                  className="settings-slider"
                />
              </label>
            )}
          </>
        )}

        {showPersistence && (
          <>
            <div className="settings-section">Persistence</div>
            {matches('autosave save persistence') && (
              <ToggleRow
                label="Autosave"
                hint="Debounced IndexedDB snapshot every few seconds"
                checked={settings.autosaveEnabled}
                onChange={(v) => onUpdate({ autosaveEnabled: v })}
              />
            )}
          </>
        )}

        {showQuality && (
          <>
            <div className="settings-section">Quality preset</div>
            <div className="preset-trio" role="group" aria-label="Quality preset">
              <button
                className="preset-card"
                onClick={() => {
                  audioSynth.playToggle(true);
                  onUpdate({
                    reducedMotion: false,
                    trajectoryPoints: 500,
                    bodyLabelsVisible: true,
                    orbitLinesVisible: true,
                    auRulerVisible: true,
                    velocityVectorsVisible: false,
                  });
                }}
                title="Full overlays and density for showcase captures"
              >
                <Clapperboard size={15} /> Cinematic
              </button>
              <button
                className="preset-card"
                onClick={() => {
                  audioSynth.playToggle(true);
                  onUpdate({
                    reducedMotion: false,
                    trajectoryPoints: 350,
                    bodyLabelsVisible: true,
                    orbitLinesVisible: true,
                    auRulerVisible: false,
                    velocityVectorsVisible: false,
                  });
                }}
                title="Balanced overlays for everyday architecting"
              >
                <Gauge size={15} /> Balanced
              </button>
              <button
                className="preset-card"
                onClick={() => {
                  audioSynth.playToggle(true);
                  onUpdate({
                    reducedMotion: true,
                    trajectoryPoints: 150,
                    bodyLabelsVisible: false,
                    orbitLinesVisible: false,
                    auRulerVisible: false,
                    velocityVectorsVisible: false,
                  });
                }}
                title="Minimum GPU load for huge systems and old tablets"
              >
                <Feather size={15} /> Performance
              </button>
            </div>
          </>
        )}

        {showRendering && (
          <>
            <div className="settings-section">Rendering</div>
            {matches('trajectory density points') && (
              <label className="settings-row">
                <span className="settings-label">
                  Trajectory density
                  <span className="settings-hint">{settings.trajectoryPoints} points per body</span>
                </span>
                <input
                  type="range"
                  min={100}
                  max={500}
                  step={50}
                  value={settings.trajectoryPoints}
                  onChange={(e) => onUpdate({ trajectoryPoints: Number(e.target.value) })}
                  aria-label="Trajectory points per body"
                  className="settings-slider"
                />
              </label>
            )}
            {matches('reduced motion animation') && (
              <ToggleRow
                label="Reduced motion"
                hint="Disables pulses, rotation, and ambient animation"
                checked={settings.reducedMotion}
                onChange={(v) => onUpdate({ reducedMotion: v })}
              />
            )}
            {matches('orbit lines keplerian ellipse') && (
              <ToggleRow
                label="Orbit lines"
                hint="Keplerian ellipse loops for every bound body"
                checked={settings.orbitLinesVisible}
                onChange={(v) => onUpdate({ orbitLinesVisible: v })}
              />
            )}
            {matches('body labels nameplates') && (
              <ToggleRow
                label="Body labels"
                hint="Floating nameplates with distance fade"
                checked={settings.bodyLabelsVisible}
                onChange={(v) => onUpdate({ bodyLabelsVisible: v })}
              />
            )}
            {matches('au ruler reference rings scale') && (
              <ToggleRow
                label="AU ruler"
                hint="Gold reference rings at 1 / 2 / 5 / 10 / 20 AU"
                checked={settings.auRulerVisible}
                onChange={(v) => onUpdate({ auRulerVisible: v })}
              />
            )}
            {matches('velocity vectors arrows thrust') && (
              <ToggleRow
                label="Velocity vectors"
                hint="Persistent thrust-style arrows on in-flight bodies"
                checked={settings.velocityVectorsVisible}
                onChange={(v) => onUpdate({ velocityVectorsVisible: v })}
              />
            )}
          </>
        )}

        {showInterface && (
          <>
            <div className="settings-section">Interface</div>
            {matches('hud hints guidance pills') && (
              <ToggleRow
                label="HUD hints"
                hint="Contextual guidance pills over the viewport"
                checked={settings.showHudHints}
                onChange={(v) => onUpdate({ showHudHints: v })}
              />
            )}
            {matches('system navigator census panel') && (
              <ToggleRow
                label="System navigator"
                hint="Show the searchable body census panel"
                checked={settings.navigatorVisible}
                onChange={(v) => onUpdate({ navigatorVisible: v })}
              />
            )}
            {matches('follow select camera track') && (
              <ToggleRow
                label="Follow on select"
                hint="Camera tracks newly selected bodies automatically"
                checked={settings.followOnSelect}
                onChange={(v) => onUpdate({ followOnSelect: v })}
              />
            )}
            {matches('approach autopilot slow impact periapsis') && (
              <ToggleRow
                label="Approach autopilot"
                hint="Auto slow-down near impacts and orbital turning points"
                checked={settings.approachAutopilot}
                onChange={(v) => onUpdate({ approachAutopilot: v })}
              />
            )}
            {matches('units metric imperial telemetry') && (
              <div className="settings-row">
                <span className="settings-label">
                  Units
                  <span className="settings-hint">Telemetry readout system</span>
                </span>
                <div className="segmented" role="group" aria-label="Unit system">
                  <button
                    className={`segmented-btn ${settings.unitSystem === 'metric' ? 'active' : ''}`}
                    aria-pressed={settings.unitSystem === 'metric'}
                    onClick={() => onUpdate({ unitSystem: 'metric' })}
                  >
                    Metric
                  </button>
                  <button
                    className={`segmented-btn ${settings.unitSystem === 'imperial' ? 'active' : ''}`}
                    aria-pressed={settings.unitSystem === 'imperial'}
                    onClick={() => onUpdate({ unitSystem: 'imperial' })}
                  >
                    Imperial
                  </button>
                </div>
              </div>
            )}
            {matches('density compact comfortable hud size chrome') && (
              <div className="settings-row">
                <span className="settings-label">
                  HUD density
                  <span className="settings-hint">Compact shrinks chrome for small tablets</span>
                </span>
                <div className="segmented" role="group" aria-label="HUD density">
                  <button
                    className={`segmented-btn ${settings.hudDensity === 'comfortable' ? 'active' : ''}`}
                    aria-pressed={settings.hudDensity === 'comfortable'}
                    onClick={() => onUpdate({ hudDensity: 'comfortable' })}
                  >
                    Comfortable
                  </button>
                  <button
                    className={`segmented-btn ${settings.hudDensity === 'compact' ? 'active' : ''}`}
                    aria-pressed={settings.hudDensity === 'compact'}
                    onClick={() => onUpdate({ hudDensity: 'compact' })}
                  >
                    Compact
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button className="btn-secondary" onClick={onReplayTour}>
            Replay welcome tour
          </button>
          <button
            className="btn-secondary"
            onClick={onReset}
            title="Restore all settings to defaults"
          >
            <RotateCcw size={14} /> Defaults
          </button>
          {onExportDiagnostics && (
            <button
              className="btn-secondary"
              onClick={onExportDiagnostics}
              title="Download the structured log + event history for bug reports (UI15)"
            >
              <FileDown size={14} /> Diagnostics
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
