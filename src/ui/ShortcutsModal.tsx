/**
 * Keyboard-shortcut reference modal (UI01 presentation layer).
 */

import React, { useMemo } from 'react';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUT_DEFINITIONS } from './shortcuts';
import { useModalA11y } from './modal-a11y';

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const groups = useMemo(() => {
    const map = new Map<string, typeof SHORTCUT_DEFINITIONS>();
    for (const def of SHORTCUT_DEFINITIONS) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <Keyboard size={18} color="#0cc6ff" />
          <h3 className="modal-title">Keyboard Shortcuts</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close shortcuts">
            <X size={16} />
          </button>
        </div>
        {groups.map(([group, defs]) => (
          <div key={group}>
            <div className="settings-section">{group}</div>
            {defs.map((def) => (
              <div key={def.id} className="shortcut-row">
                <span className="shortcut-label">{def.label}</span>
                <span className="shortcut-keys">
                  {def.keys.map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
