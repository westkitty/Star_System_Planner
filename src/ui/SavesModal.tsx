import React from 'react';
import { ModalShell } from './ModalShell';
import { DatabaseProjectSummary } from '../persistence/db';
import { FolderOpen, Trash2, Save, RefreshCw } from 'lucide-react';

interface SavesModalProps {
  saves: DatabaseProjectSummary[];
  onLoad: (projectId: string) => void;
  onDelete: (projectId: string, name: string) => void;
  onSaveAs: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const SavesModal: React.FC<SavesModalProps> = ({
  saves, onLoad, onDelete, onSaveAs, onRefresh, onClose,
}) => {
  return (
    <ModalShell
      title="SAVED SYSTEMS VAULT"
      subtitle={saves.length === 0 ? 'No named saves yet — commit one to preserve a timeline outside the rolling autosave' : `${saves.length} named save${saves.length === 1 ? '' : 's'}`}
      onClose={onClose}
      width={480}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button className="ui-button primary" onClick={onSaveAs}>
          <Save size={13} /> Commit Current Snapshot
        </button>
        <button className="ui-button ghost" onClick={onRefresh}>
          <RefreshCw size={13} />
        </button>
      </div>

      {saves.length === 0 && (
        <div className="empty-state">
          The vault is empty. Shape a system you love, then commit it here —
          it survives app restarts and autosave overwrite cycles.
        </div>
      )}

      <div className="save-list">
        {saves.map(s => (
          <div key={s.projectId} className="save-row">
            <div className="save-copy">
              <span className="save-name">{s.projectName}</span>
              <span className="save-meta">
                {new Date(s.updatedAtIso).toLocaleString()}
              </span>
            </div>
            <button className="ui-button" onClick={() => onLoad(s.projectId)}>
              <FolderOpen size={12} /> Load
            </button>
            <button
              className="ui-button ghost danger-hover"
              aria-label={`Delete ${s.projectName}`}
              onClick={() => onDelete(s.projectId, s.projectName)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};
