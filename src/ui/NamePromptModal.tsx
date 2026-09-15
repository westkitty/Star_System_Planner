import React, { useState } from 'react';
import { ModalShell } from './ModalShell';

interface NamePromptModalProps {
  title: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/** Tablet-native replacement for window.prompt — never blocked by WebViews. */
export const NamePromptModal: React.FC<NamePromptModalProps> = ({
  title,
  label,
  defaultValue,
  placeholder,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);

  return (
    <ModalShell title={title} onClose={onCancel} width={400}>
      <label className="field-label">{label}</label>
      <input
        className="text-input"
        value={value}
        placeholder={placeholder}
        maxLength={64}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
        }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="ui-button" onClick={onCancel}>Cancel</button>
        <button
          className="ui-button primary"
          disabled={!value.trim()}
          onClick={() => onConfirm(value.trim())}
        >
          Confirm
        </button>
      </div>
    </ModalShell>
  );
};
