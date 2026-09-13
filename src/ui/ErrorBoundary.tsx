/**
 * React error boundary + crash fallback (BACK03).
 *
 * Catches render-time failures anywhere in the HUD tree and renders a
 * recovery screen (reload / download diagnostics) instead of a blank
 * page, while logging the full component stack.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { logger } from '../core/logger';
import { toErrorCode, toUserMessage } from '../core/errors';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, componentStack: null };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('react', `Uncaught render error: ${error.message}`, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private downloadDiagnostics = (): void => {
    const blob = new Blob(
      [
        logger.exportDiagnostics({
          crash: {
            message: this.state.error?.message,
            stack: this.state.error?.stack,
            componentStack: this.state.componentStack,
          },
        }),
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'starsilk-diagnostics.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  public render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot-splash" role="alert">
        <div className="boot-card">
          <AlertTriangle size={28} color="#ff4d64" />
          <div className="boot-title" style={{ marginTop: '12px' }}>
            Interface disruption detected
          </div>
          <div className="boot-blocked-message">
            {this.state.error ? toUserMessage(this.state.error) : 'An unexpected rendering fault occurred.'}{' '}
            Your simulation autosave is preserved in local storage.
          </div>
          <div className="error-code-chip" aria-label="Error code">
            FAULT {this.state.error ? toErrorCode(this.state.error) : 'UNKNOWN'}
          </div>
          <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
            <button className="btn-secondary" onClick={this.downloadDiagnostics}>
              Download diagnostics
            </button>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload planner
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Install process-level guards for uncaught errors and rejections. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => {
    logger.error('window', `Uncaught error: ${e.message}`, { filename: e.filename, lineno: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    logger.error('window', `Unhandled rejection: ${reason}`, e.reason);
  });
}
