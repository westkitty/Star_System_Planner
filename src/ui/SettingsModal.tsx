/**
 * Consolidated planner settings modal (UI15).
 *
 * Audio (volume + enable), persistence (autosave), rendering (trajectory
 * density, reduced motion), and interface (hints, navigator, follow, tour
 * replay) — all persisted and applied live without reload.
 */

import React from 'react';
import { Settings, RotateCcw, FileDown } from 'lucide-react';
import { PlannerSettings } from '../core/settings';
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

        <div className="settings-section">Audio</div>
        <ToggleRow
          label="Tactile audio"
          hint="Synthesized ticks, chimes, and collapse drones"
          checked={settings.audioEnabled}
          onChange={(v) => onUpdate({ audioEnabled: v })}
        />
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

        <div className="settings-section">Persistence</div>
        <ToggleRow
          label="Autosave"
          hint="Debounced IndexedDB snapshot every few seconds"
          checked={settings.autosaveEnabled}
          onChange={(v) => onUpdate({ autosaveEnabled: v })}
        />

        <div className="settings-section">Rendering</div>
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
        <ToggleRow
          label="Reduced motion"
          hint="Disables pulses, rotation, and ambient animation"
          checked={settings.reducedMotion}
          onChange={(v) => onUpdate({ reducedMotion: v })}
        />

        <div className="settings-section">Interface</div>
        <ToggleRow
          label="HUD hints"
          hint="Contextual guidance pills over the viewport"
          checked={settings.showHudHints}
          onChange={(v) => onUpdate({ showHudHints: v })}
        />
        <ToggleRow
          label="System navigator"
          hint="Show the searchable body census panel"
          checked={settings.navigatorVisible}
          onChange={(v) => onUpdate({ navigatorVisible: v })}
        />
        <ToggleRow
          label="Follow on select"
          hint="Camera tracks newly selected bodies automatically"
          checked={settings.followOnSelect}
          onChange={(v) => onUpdate({ followOnSelect: v })}
        />

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
