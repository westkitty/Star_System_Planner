import React from 'react';
import { MousePointer, Hand, PlusCircle, Compass, GitCommit, Waves, Focus, BookOpen } from 'lucide-react';
import { PointerToolMode } from '../interaction/pointer-manager';

interface ToolRailProps {
  activeTool: PointerToolMode;
  onSelectTool: (tool: PointerToolMode) => void;
  showFuture: boolean;
  onToggleShowFuture: () => void;
  showSensitivity: boolean;
  onToggleShowSensitivity: () => void;
  onOpenCreateModal: () => void;
  onOpenCanonLab?: () => void;
  onResetCamera: () => void;
}

export const ToolRail: React.FC<ToolRailProps> = ({
  activeTool,
  onSelectTool,
  showFuture,
  onToggleShowFuture,
  showSensitivity,
  onToggleShowSensitivity,
  onOpenCreateModal,
  onOpenCanonLab,
  onResetCamera,
}) => {
  return (
    <aside className="left-tool-rail hud-interactive" role="toolbar" aria-label="Planner tools" aria-orientation="vertical">
      {/* Select / Pointer */}
      <button
        className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
        onClick={() => onSelectTool('select')}
        title="Pointer / Selection — S Pen / Finger (1)"
        aria-label="Select tool"
        aria-pressed={activeTool === 'select'}
      >
        <MousePointer size={18} />
        <span>SELECT</span>
      </button>

      {/* Grab & Throw */}
      <button
        className={`tool-button ${activeTool === 'grab_throw' ? 'active' : ''}`}
        onClick={() => onSelectTool('grab_throw')}
        title="Grab & Throw: Drag a body to adjust position or throw into orbit (2)"
        aria-label="Grab and throw tool"
        aria-pressed={activeTool === 'grab_throw'}
      >
        <Hand size={18} color="#f59e0b" />
        <span>GRAB</span>
      </button>

      {/* Create Body */}
      <button
        className="tool-button"
        onClick={onOpenCreateModal}
        title="Create Celestial Body — Star, Planet, Moon, Station (N)"
        aria-label="Create celestial body"
      >
        <PlusCircle size={18} color="#0cc6ff" />
        <span>CREATE</span>
      </button>

      {/* Orbit Loom */}
      <button
        className={`tool-button ${activeTool === 'orbit_loom' ? 'active' : ''}`}
        onClick={() => onSelectTool('orbit_loom')}
        title="Orbit Loom: Sketch an orbit with S Pen to fit conic ellipses (3)"
        aria-label="Orbit loom tool"
        aria-pressed={activeTool === 'orbit_loom'}
      >
        <Compass size={18} color="#49e7ff" />
        <span>LOOM</span>
      </button>

      {/* Show Future */}
      <button
        className={`tool-button ${showFuture ? 'active' : ''}`}
        onClick={onToggleShowFuture}
        title="Show Future: Predict trajectories and collisions"
        aria-label="Toggle future trajectories"
        aria-pressed={showFuture}
      >
        <GitCommit size={18} />
        <span>FUTURE</span>
      </button>

      {/* Sensitivity Cloud */}
      <button
        className={`tool-button ${showSensitivity ? 'active' : ''}`}
        onClick={onToggleShowSensitivity}
        title="Sensitivity Cloud: 30 perturbed futures showing dynamical sensitivity"
        aria-label="Toggle sensitivity cloud"
        aria-pressed={showSensitivity}
      >
        <Waves size={18} />
        <span>SENSITIVITY</span>
      </button>

      {/* Canon Lab Button */}
      {onOpenCanonLab && (
        <button
          className="tool-button"
          onClick={onOpenCanonLab}
          title="Starsilk Canon Lab: Cosmological Mechanisms"
          aria-label="Open canon lab"
        >
          <BookOpen size={18} color="#d4a373" />
          <span>CANON</span>
        </button>
      )}

      <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

      {/* Reset Camera Focus */}
      <button
        className="tool-button"
        onClick={onResetCamera}
        title="Center / Reset Camera View (C)"
        aria-label="Reset camera"
      >
        <Focus size={18} />
        <span>CENTER</span>
      </button>
    </aside>
  );
};
