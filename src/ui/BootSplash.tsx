/**
 * Boot splash + capability-failure screen (UI08).
 *
 * Covers cold start with staged progress, then yields to the viewport.
 * When WebGL is unavailable it renders an explanatory blocked screen with
 * diagnostics instead of a black void.
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { CapabilityReport } from '../core/capabilities';

interface BootSplashProps {
  stage: string;
  progress: number; // 0..1
  capabilities: CapabilityReport | null;
  onDownloadDiagnostics: () => void;
}

export const BootSplash: React.FC<BootSplashProps> = ({
  stage,
  progress,
  capabilities,
  onDownloadDiagnostics,
}) => {
  const blocked = capabilities?.summary === 'blocked';

  return (
    <div className="boot-splash" role={blocked ? 'alert' : 'status'} aria-live="polite">
      <div className="boot-card">
        <div className="boot-sigil">
          <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="#0cc6ff" strokeWidth="2" />
            <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#49e7ff" strokeWidth="1" transform="rotate(-20 32 32)" />
            <ellipse cx="32" cy="32" rx="18" ry="7" fill="none" stroke="#0cc6ff" strokeWidth="1" opacity="0.6" transform="rotate(-20 32 32)" />
            <circle cx="32" cy="32" r="5" fill="#0cc6ff" />
            <circle cx="32" cy="32" r="2" fill="#ffffff" />
          </svg>
        </div>
        <div className="boot-title">STARSILK SYSTEM PLANNER</div>
        <div className="boot-subtitle">Tactile stellar-architecture laboratory</div>

        {blocked && capabilities ? (
          <div className="boot-blocked">
            <AlertTriangle size={20} color="#ff4d64" />
            <div className="boot-blocked-title">3D viewport unavailable</div>
            {capabilities.blockers.map((b) => (
              <div key={b} className="boot-blocked-message">
                {b}
              </div>
            ))}
            <button className="btn-secondary" onClick={onDownloadDiagnostics}>
              Download diagnostics
            </button>
          </div>
        ) : (
          <>
            <div className="boot-progress-track" aria-hidden="true">
              <div className="boot-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="boot-stage">
              {progress >= 1 ? <CheckCircle size={14} color="#34d399" /> : <Loader size={14} className="spin" />}
              <span>{stage}</span>
            </div>
            {capabilities && capabilities.warnings.length > 0 && (
              <div className="boot-warnings">
                {capabilities.warnings.map((w) => (
                  <div key={w} className="boot-warning">
                    {w}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
