/**
 * Structured import diagnostics dialog (iteration 3, UI14).
 *
 * When a project file fails validation, architects get the full defect
 * list with JSON-path locators and one-tap copy — not a truncated toast.
 * Migration notes render alongside so "fixed automatically" stays visible.
 */

import React from 'react';
import { X, AlertTriangle, ClipboardCopy, Check } from 'lucide-react';
import { ValidationIssue } from '../persistence/validation';
import { useModalA11y } from './modal-a11y';

interface ImportDiagnosticsDialogProps {
  fileName: string;
  issues: ValidationIssue[];
  migrationNotes: string[];
  onClose: () => void;
}

export const ImportDiagnosticsDialog: React.FC<ImportDiagnosticsDialogProps> = ({
  fileName,
  issues,
  migrationNotes,
  onClose,
}) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [copied, setCopied] = React.useState(false);

  const copyDiagnostics = (): void => {
    const text = [
      `Import diagnostics for ${fileName}`,
      ...migrationNotes.map((n) => `migrated: ${n}`),
      ...issues.map((i) => `${i.path}: ${i.message}`),
    ].join('\n');
    try {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="modal-backdrop hud-interactive" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel import-diag-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Import diagnostics"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <AlertTriangle size={17} color="#fbbf24" />
          <h3 className="modal-title">IMPORT BLOCKED — {issues.length} ISSUE{issues.length === 1 ? '' : 'S'}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close import diagnostics">
            <X size={16} />
          </button>
        </div>
        <div className="import-diag-file">{fileName}</div>
        {migrationNotes.length > 0 && (
          <div className="import-diag-notes">
            {migrationNotes.map((n, i) => (
              <div key={i} className="import-diag-note">{n}</div>
            ))}
          </div>
        )}
        <div className="import-diag-list" role="list">
          {issues.slice(0, 60).map((issue, i) => (
            <div key={i} className="import-diag-row" role="listitem">
              <span className="import-diag-path">{issue.path}</span>
              <span className="import-diag-msg">{issue.message}</span>
            </div>
          ))}
          {issues.length > 60 && (
            <div className="import-diag-more">…plus {issues.length - 60} more issues</div>
          )}
        </div>
        <div className="import-diag-actions">
          <button className="btn-secondary" onClick={copyDiagnostics}>
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
            {copied ? 'Copied' : 'Copy diagnostics'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
