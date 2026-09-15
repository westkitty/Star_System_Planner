import React from 'react';
import { ModalShell } from './ModalShell';
import { UserPrefs } from '../persistence/prefs';
import { Volume2, Waves, Tags, Wind, Telescope, Droplets, ScanEye, MousePointer2, Gauge } from 'lucide-react';

interface SettingsModalProps {
  prefs: UserPrefs;
  onUpdate: (patch: Partial<UserPrefs>) => void;
  sensitivityOn: boolean;
  showFuture: boolean;
  onClose: () => void;
}

const Toggle: React.FC<{
  label: string;
  hint: string;
  value: boolean;
  icon?: React.ReactNode;
  onChange: (v: boolean) => void;
}> = ({ label, hint, value, icon, onChange }) => (
  <div className="setting-row">
    <div className="setting-copy">
      <span className="setting-label">{icon}{label}</span>
      <span className="setting-hint">{hint}</span>
    </div>
    <button
      className={`toggle-switch ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span className="toggle-knob" />
    </button>
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ prefs, onUpdate, sensitivityOn, showFuture, onClose }) => {
  return (
    <ModalShell title="FIELD SETTINGS" subtitle="Persisted locally to this device" onClose={onClose} width={520}>
      <div className="settings-group">
        <div className="settings-group-title">SCENE ARCHITECTURE</div>
        <Toggle
          label="Body Labels"
          hint="Name sprites above every body, distance-faded"
          value={prefs.showLabels}
          icon={<Tags size={12} />}
          onChange={(v) => onUpdate({ showLabels: v })}
        />
        <Toggle
          label="Orbital Trails"
          hint="Recorded path history for every body"
          value={prefs.showTrails}
          icon={<Wind size={12} />}
          onChange={(v) => onUpdate({ showTrails: v })}
        />
        <Toggle
          label="Habitable Zone"
          hint="Goldilocks annulus rendered around each luminous star"
          value={prefs.showHabitableZone}
          icon={<Droplets size={12} />}
          onChange={(v) => onUpdate({ showHabitableZone: v })}
        />
        <Toggle
          label="X-Ray Lens"
          hint="Osculating orbit, Hill sphere, Roche shell & Lagrange markers on the selected body"
          value={prefs.showXRay}
          icon={<ScanEye size={12} />}
          onChange={(v) => onUpdate({ showXRay: v })}
        />
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label"><Telescope size={12} />Trail Depth</span>
            <span className="setting-hint">Polyline samples kept per body (900 sim-sec each)</span>
          </div>
          <input
            type="range" min={48} max={600} step={8}
            value={prefs.trailLengthPoints}
            onChange={(e) => onUpdate({ trailLengthPoints: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">PHYSICS & FORECAST</div>
        <Toggle
          label="Roche Fragmentation"
          hint="Bodies shredded inside a companion's Roche limit"
          value={prefs.rocheBreaking}
          onChange={(v) => onUpdate({ rocheBreaking: v })}
        />
        <Toggle
          label="Auto-Pause on Catastrophe"
          hint="Freeze time the instant a collision or breakup lands"
          value={prefs.autoPauseOnCatastrophe}
          icon={<Gauge size={12} />}
          onChange={(v) => onUpdate({ autoPauseOnCatastrophe: v })}
        />
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Sensitivity Perturbation</span>
            <span className="setting-hint">Fan velocity jitter (active only while the sensitivity cloud is on)</span>
          </div>
          <input
            type="range" min={0.1} max={5} step={0.1}
            value={prefs.perturbPercent}
            disabled={!sensitivityOn}
            onChange={(e) => onUpdate({ perturbPercent: Number(e.target.value) })}
          />
          <span className="setting-value">{prefs.perturbPercent.toFixed(1)}%</span>
        </div>
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Forecast Horizon</span>
            <span className="setting-hint">Depth of the predicted future paths (active while future paths are on)</span>
          </div>
          <select
            className="select-input"
            value={prefs.forecastHorizon}
            disabled={!showFuture}
            onChange={(e) => onUpdate({ forecastHorizon: e.target.value as UserPrefs['forecastHorizon'] })}
          >
            <option value="near">Near (10 h)</option>
            <option value="standard">Standard (24 h)</option>
            <option value="deep">Deep (72 h)</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">SENSORY FIELD</div>
        <Toggle
          label="Interface Audio"
          hint="Synthesized clicks, locks & collapse tones"
          value={prefs.audioEnabled}
          icon={<Volume2 size={12} />}
          onChange={(v) => onUpdate({ audioEnabled: v })}
        />
        <Toggle
          label="Audible Orrery"
          hint="The system harmonizes itself — orbital mean motion mapped to drone voices"
          value={prefs.orreryEnabled}
          icon={<Waves size={12} />}
          onChange={(v) => onUpdate({ orreryEnabled: v })}
        />
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label"><MousePointer2 size={12} />Camera Sensitivity</span>
            <span className="setting-hint">Orbit/zoom response multiplier</span>
          </div>
          <input
            type="range" min={0.4} max={2.5} step={0.05}
            value={prefs.cameraSensitivity}
            onChange={(e) => onUpdate({ cameraSensitivity: Number(e.target.value) })}
          />
        </div>
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-label">Render Quality</span>
            <span className="setting-hint">Pixel density cap; LOW is battery-gentle</span>
          </div>
          <select
            className="select-input"
            value={prefs.renderQuality}
            onChange={(e) => onUpdate({ renderQuality: e.target.value as UserPrefs['renderQuality'] })}
          >
            <option value="auto">Auto</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
    </ModalShell>
  );
};
