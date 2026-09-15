import React from 'react';
import type { ToastItem } from '../App';

export const Toasts: React.FC<{ toasts: ToastItem[] }> = ({ toasts }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-rail" />
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  );
};
