import React from 'react';
import { Eye, Volume2, VolumeX, Grid, Download, Upload, Sparkles, Settings, Save, Pencil } from 'lucide-react';
import { ScaleMode } from '../rendering/scale-transform';
import { SystemStatus } from '../simulation/types';

export type AppMode = 'BUILD' | 'SIMULATE' | 'FORECAST' | 'CANON LAB' | 'PRESENT';

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
  onExport: () => void;
  onImport: () => void;
  onLoadPreset: (name: 'demo' | 'meridian' | 'blank') => void;
  onOpenSettings: () => void;
  onOpenSaves: () => void;
  onRename: () => void;
  lastSaveTime: string | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  sigilSvg,
  systemStatus,
  mode,
  onSetMode,
  scaleMode,
  onToggleScaleMode,
  collisionsEnabled,
  onToggleCollisions,
  audioEnabled,
  onToggleAudio,
  gravityGridVisible,
  onToggleGravityGrid,
  onExport,
  onImport,
  onLoadPreset,
  onOpenSettings,
  onOpenSaves,
  onRename,
  lastSaveTime,
}) => {
  return (
    <header className="top-hud-bar hud-interactive">
      {/* Brand & Sigil */}
      <div className="brand-section">
        <div
          className="brand-sigil"
          dangerouslySetInnerHTML={{ __html: sigilSvg }}
          title="System Sigil — Deterministic Architectural Fingerprint"
        />
        <div>
          <div className="brand-title">STARSILK SYSTEM PLANNER</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="brand-subtitle">{projectName}</span>
            <button
              onClick={onRename}
              title="Rename system"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
            >
              <Pencil size={10} />
            </button>
            {lastSaveTime && (
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                saved {lastSaveTime}
              </span>
            )}
            {systemStatus === 'destroyed_by_starsilk_collapse' && (
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: '#ff4d64',
                background: 'rgba(136, 0, 16, 0.5)',
                border: '1px solid #ff4d64',
                padding: '1px 6px',
                borderRadius: '3px',
                textTransform: 'uppercase',
              }}>
                SYSTEM DESTROYED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Preset Selector */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onLoadPreset('demo')}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title="Load demonstration system"
        >
          Demo System
        </button>
        <button
          onClick={() => onLoadPreset('meridian')}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title="Load source-backed Virgil & Meridian Station scenario"
        >
          Meridian Study
        </button>
        <button
          onClick={() => onLoadPreset('blank')}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title="Empty void for new creation"
        >
          Blank System
        </button>
      </div>

      {/* Center Modes */}
      <nav className="mode-switcher">
        {(['BUILD', 'SIMULATE', 'FORECAST', 'CANON LAB', 'PRESENT'] as AppMode[]).map((m) => (
          <button
            key={m}
            className={`mode-tab ${mode === m ? 'active' : ''}`}
            onClick={() => onSetMode(m)}
          >
            {m === 'CANON LAB' && <Sparkles size={12} />}
            {m}
          </button>
        ))}
      </nav>

      {/* Right Controls / Lenses */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Scale Toggle */}
        <button
          onClick={onToggleScaleMode}
          style={{
            background: scaleMode === 'true' ? '#0cc6ff' : 'rgba(7, 19, 30, 0.8)',
            color: scaleMode === 'true' ? '#03050a' : 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
          title={scaleMode === 'true' ? 'True astronomical scale (empty void)' : 'Readable exaggerated scale'}
        >
          <Eye size={13} />
          {scaleMode === 'true' ? 'TRUE SCALE' : 'READABLE'}
        </button>

        {/* Collisions Toggle */}
        <button
          onClick={onToggleCollisions}
          style={{
            background: collisionsEnabled ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.8)',
            color: collisionsEnabled ? 'var(--accent-azure)' : 'var(--text-muted)',
            border: `1px solid ${collisionsEnabled ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="Toggle physical collisions and momentum merges"
        >
          COLLISIONS: {collisionsEnabled ? 'ON' : 'OFF'}
        </button>

        {/* Gravity Field Grid */}
        <button
          onClick={onToggleGravityGrid}
          style={{
            background: gravityGridVisible ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.8)',
            color: gravityGridVisible ? 'var(--accent-azure)' : 'var(--text-muted)',
            border: `1px solid ${gravityGridVisible ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title="Toggle Newtonian Potential Gravity Grid"
        >
          <Grid size={14} />
        </button>

        {/* Audio Toggle */}
        <button
          onClick={onToggleAudio}
          style={{
            background: audioEnabled ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.8)',
            color: audioEnabled ? 'var(--accent-azure)' : 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title={audioEnabled ? 'Sound ON' : 'Sound OFF (Web Audio)'}
        >
          {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {/* Saved projects vault */}
        <button
          onClick={onOpenSaves}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title="Saved Systems vault (save / load / delete)"
        >
          <Save size={14} />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title="Render, audio, camera & forecast settings"
        >
          <Settings size={14} />
        </button>

        {/* Export / Import */}
        <button
          onClick={onExport}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title="Export System (.ssp.json)"
        >
          <Download size={14} />
        </button>

        <button
          onClick={onImport}
          style={{
            background: 'rgba(7, 19, 30, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
          }}
          title="Import System (.ssp.json)"
        >
          <Upload size={14} />
        </button>
      </div>
    </header>
  );
};
