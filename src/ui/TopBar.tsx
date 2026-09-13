/**
 * Top command bar: brand + sigil, system presets (incl. procedural
 * seed worlds — GAME13), mode switcher, lens toggles (gravity grid,
 * habitable zones), undo (GAME08), panels (navigator, missions, stats,
 * settings, shortcuts), autosave status (BACK04), and perf readout (BACK07).
 */

import React, { useState } from 'react';
import {
  Eye, Volume2, VolumeX, Grid, Download, Upload, Sparkles, Undo2, ListTree,
  Trophy, BarChart3, Settings, Keyboard, Leaf, Dices, ChevronDown, Activity,
} from 'lucide-react';
import { ScaleMode } from '../rendering/scale-transform';
import { SystemStatus } from '../simulation/types';
import { AutosaveStatus } from '../persistence/autosave';
import { formatRelativeTime } from '../simulation/units';

export type AppMode = 'BUILD' | 'SIMULATE' | 'FORECAST' | 'CANON LAB' | 'PRESENT';
export type PresetKind = 'demo' | 'meridian' | 'blank' | 'procedural';

interface TopBarProps {
  projectName: string;
  sigilSvg: string;
  systemStatus?: SystemStatus;
  mode: AppMode;
  onSetMode: (m: AppMode) => void;
  scaleMode: ScaleMode;
  onToggleScaleMode: () => void;
  collisionsEnabled: boolean;
  onToggleCollisions: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  gravityGridVisible: boolean;
  onToggleGravityGrid: () => void;
  hzVisible: boolean;
  onToggleHz: () => void;
  onExport: () => void;
  onImport: () => void;
  onLoadPreset: (name: PresetKind) => void;
  undoDepth: number;
  onUndo: () => void;
  autosaveStatus: AutosaveStatus;
  autosaveAtMs: number | null;
  fps: number | null;
  navigatorVisible: boolean;
  onToggleNavigator: () => void;
  missionsVisible: boolean;
  onToggleMissions: () => void;
  missionsDone: number;
  missionsTotal: number;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

function IconBtn(props: {
  onClick: () => void;
  title: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={props.onClick}
      className={`topbar-icon-btn ${props.active ? 'active' : ''}`}
      title={props.title}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

const AUTOSAVE_DOT: Record<AutosaveStatus, string> = {
  idle: 'var(--text-muted)',
  saving: '#fbbf24',
  saved: '#34d399',
  error: '#ff4d64',
  disabled: 'var(--text-muted)',
};

export const TopBar: React.FC<TopBarProps> = (props) => {
  const {
    projectName, sigilSvg, systemStatus, mode, onSetMode, scaleMode, onToggleScaleMode,
    collisionsEnabled, onToggleCollisions, audioEnabled, onToggleAudio,
    gravityGridVisible, onToggleGravityGrid, hzVisible, onToggleHz,
    onExport, onImport, onLoadPreset,
  } = props;
  const [presetOpen, setPresetOpen] = useState(false);

  const choosePreset = (kind: PresetKind): void => {
    setPresetOpen(false);
    onLoadPreset(kind);
  };

  return (
    <header className="top-hud-bar hud-interactive" role="banner">
      <div className="brand-section">
        <div
          className="brand-sigil"
          dangerouslySetInnerHTML={{ __html: sigilSvg }}
          title="System Sigil — Deterministic Architectural Fingerprint"
        />
        <div className="brand-text">
          <div className="brand-title">STARSILK SYSTEM PLANNER</div>
          <div className="brand-subrow">
            <span className="brand-subtitle">{projectName}</span>
            {systemStatus === 'destroyed_by_starsilk_collapse' && (
              <span className="badge-destroyed">SYSTEM DESTROYED</span>
            )}
          </div>
        </div>
        <div
          className="autosave-pill"
          title={
            props.autosaveStatus === 'saved'
              ? `Autosaved ${formatRelativeTime(props.autosaveAtMs)}`
              : props.autosaveStatus === 'error'
                ? 'Autosave failed — export .ssp.json to be safe'
                : props.autosaveStatus === 'disabled'
                  ? 'Autosave disabled in settings'
                  : 'Autosave idle'
          }
        >
          <span className="autosave-dot" style={{ background: AUTOSAVE_DOT[props.autosaveStatus] }} />
          <span className="autosave-label">
            {props.autosaveStatus === 'saved'
              ? `Saved ${formatRelativeTime(props.autosaveAtMs)}`
              : props.autosaveStatus.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="preset-menu-wrap">
          <button
            className="preset-menu-btn"
            onClick={() => setPresetOpen(!presetOpen)}
            aria-haspopup="menu"
            aria-expanded={presetOpen}
            title="Load a star-system preset"
          >
            Systems <ChevronDown size={13} />
          </button>
          {presetOpen && (
            <div className="preset-menu" role="menu">
              <button role="menuitem" onClick={() => choosePreset('demo')}>Kallisto Demo System</button>
              <button role="menuitem" onClick={() => choosePreset('meridian')}>Virgil &amp; Meridian Study</button>
              <button role="menuitem" onClick={() => choosePreset('procedural')}>
                <Dices size={13} /> Procedural Seed World
              </button>
              <button role="menuitem" onClick={() => choosePreset('blank')}>Blank Void</button>
            </div>
          )}
        </div>

        <nav className="mode-switcher" aria-label="Planner mode">
          {(['BUILD', 'SIMULATE', 'FORECAST', 'CANON LAB', 'PRESENT'] as AppMode[]).map((m) => (
            <button
              key={m}
              className={`mode-tab ${mode === m ? 'active' : ''}`}
              onClick={() => onSetMode(m)}
              aria-pressed={mode === m}
            >
              {m === 'CANON LAB' && <Sparkles size={12} />}
              {m}
            </button>
          ))}
        </nav>
      </div>

      <div className="topbar-right">
        <button onClick={onToggleScaleMode} className="topbar-pill-btn" title={scaleMode === 'true' ? 'True astronomical scale' : 'Readable exaggerated scale'}>
          <Eye size={13} />
          {scaleMode === 'true' ? 'TRUE' : 'READABLE'}
        </button>

        <button
          onClick={onToggleCollisions}
          className={`topbar-pill-btn ${collisionsEnabled ? 'active' : ''}`}
          title="Toggle physical collisions and momentum merges"
          aria-pressed={collisionsEnabled}
        >
          {collisionsEnabled ? 'COLLIDE ON' : 'COLLIDE OFF'}
        </button>

        <IconBtn onClick={onToggleGravityGrid} title="Newtonian potential gravity grid (G)" label="Toggle gravity grid" active={gravityGridVisible}>
          <Grid size={14} />
        </IconBtn>
        <IconBtn onClick={onToggleHz} title="Habitable-zone overlay (H)" label="Toggle habitable zones" active={hzVisible}>
          <Leaf size={14} />
        </IconBtn>
        <IconBtn onClick={onToggleAudio} title={audioEnabled ? 'Sound ON' : 'Sound OFF'} label="Toggle audio" active={audioEnabled}>
          {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </IconBtn>
        <IconBtn
          onClick={props.onUndo}
          title={props.undoDepth > 0 ? `Undo last destructive action (Ctrl+Z, ${props.undoDepth} available)` : 'Nothing to undo'}
          label="Undo"
          disabled={props.undoDepth === 0}
        >
          <Undo2 size={14} />
        </IconBtn>
        <IconBtn onClick={props.onToggleNavigator} title="System navigator (V)" label="Toggle navigator" active={props.navigatorVisible}>
          <ListTree size={14} />
        </IconBtn>
        <IconBtn onClick={props.onToggleMissions} title={`Architect missions — ${props.missionsDone}/${props.missionsTotal} complete (M)`} label="Toggle missions" active={props.missionsVisible}>
          <Trophy size={14} />
        </IconBtn>
        <IconBtn onClick={props.onOpenStats} title="System statistics (S)" label="Open statistics">
          <BarChart3 size={14} />
        </IconBtn>
        <IconBtn onClick={props.onOpenSettings} title="Planner settings" label="Open settings">
          <Settings size={14} />
        </IconBtn>
        <IconBtn onClick={props.onOpenHelp} title="Keyboard shortcuts (?)" label="Open shortcut help">
          <Keyboard size={14} />
        </IconBtn>
        <IconBtn onClick={onExport} title="Export system (.ssp.json)" label="Export system">
          <Download size={14} />
        </IconBtn>
        <IconBtn onClick={onImport} title="Import system (.ssp.json)" label="Import system">
          <Upload size={14} />
        </IconBtn>

        {props.fps !== null && (
          <span className="perf-pill" title="Render frame rate">
            <Activity size={12} />
            {Math.round(props.fps)}
          </span>
        )}
      </div>
    </header>
  );
};
