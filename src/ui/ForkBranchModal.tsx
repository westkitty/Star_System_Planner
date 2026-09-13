/**
 * Named branch-fork dialog (UI04).
 *
 * Replaces the blocking window.prompt() with a validated, styled modal:
 * inline naming guidance, duplicate-name detection, and keyboard submit.
 */

import React, { useMemo, useState } from 'react';
import { GitFork } from 'lucide-react';
import { TimelineBranch } from '../branching/branch-types';
import { useModalA11y } from './modal-a11y';

interface ForkBranchModalProps {
  branches: TimelineBranch[];
  suggestedName: string;
  onFork: (name: string) => void;
  onClose: () => void;
}

export const ForkBranchModal: React.FC<ForkBranchModalProps> = ({
  branches,
  suggestedName,
  onFork,
  onClose,
}) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [name, setName] = useState(suggestedName);

  const error = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return 'Give the branch a name to continue.';
    if (trimmed.length > 60) return 'Branch names are limited to 60 characters.';
    if (branches.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      return 'A branch with this name already exists.';
    }
    return null;
  }, [name, branches]);

  const submit = () => {
    if (error) return;
    onFork(name.trim());
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel modal-narrow"
        role="dialog"
        aria-modal="true"
        aria-label="Fork timeline branch"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <GitFork size={18} color="#0cc6ff" />
          <h3 className="modal-title">Fork Timeline Branch</h3>
        </div>
        <p className="modal-message">
          Snapshot the live simulation into an isolated causal branch. The parent timeline is preserved untouched.
        </p>
        <label className="field-label" htmlFor="fork-branch-name">
          Branch name
        </label>
        <input
          id="fork-branch-name"
          className="text-input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. Black Hole Injected"
        />
        {error && <div className="field-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!!error}>
            Fork Branch
          </button>
        </div>
      </div>
    </div>
  );
};
