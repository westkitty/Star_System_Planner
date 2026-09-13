/**
 * Per-panel error isolation (iteration 3, BACK11).
 *
 * The root boundary catches everything but replaces the whole HUD. These
 * panel-level boundaries quarantine a crashing TopBar, timeline, or
 * inspector behind a compact fallback with retry — one sick panel can no
 * longer take down the viewport, canvas, or simulation loop.
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface PanelErrorBoundaryProps {
  panel: string;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error): void {
    try {
      console.error(`[panel-error:${this.props.panel}]`, error);
    } catch {
      /* logging must never throw */
    }
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  public render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="panel-error-fallback hud-interactive" role="alert">
          <AlertTriangle size={14} color="#fbbf24" />
          <span className="panel-error-text">
            {this.props.panel} hiccup — {this.state.error.message || 'render failed'}
          </span>
          <button className="panel-error-retry" onClick={this.retry} title={`Retry ${this.props.panel}`}>
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
