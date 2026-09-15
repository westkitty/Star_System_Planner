import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal architecture: keyboard-focuslight shell with backdrop tap-out,
 * Escape dismissal, and initial focus capture for pen/mouse parity.
 */
export const ModalShell: React.FC<ModalShellProps> = ({ title, subtitle, width = 480, onClose, children }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    cardRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={cardRef}
        className="modal-card"
        style={{ width, maxWidth: '92vw', maxHeight: '86vh' }}
        role="dialog"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button className="ui-button ghost icon-only" onClick={onClose} aria-label="Close modal">
            <X size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};
