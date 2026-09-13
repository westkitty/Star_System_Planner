/**
 * First-run guided onboarding overlay (UI02).
 *
 * A four-step coachmark tour (viewport, tools, timeline, canon) shown on
 * first launch and re-openable from settings. Completion persists so
 * returning architects are never nagged.
 */

import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, MousePointer, Hand, Compass, BookOpen } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

interface OnboardingOverlayProps {
  onComplete: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    icon: <MousePointer size={26} color="#0cc6ff" />,
    title: 'Sculpt star systems by hand',
    body: 'Drag to orbit the camera, pinch to zoom, and tap any world to inspect its live orbital telemetry. Everything you see is integrated with real Newtonian physics.',
  },
  {
    icon: <Hand size={26} color="#f59e0b" />,
    title: 'Grab worlds and throw them',
    body: 'Switch to GRAB, seize a moon, stretch the azure velocity vector, and release to inject momentum. Enable SHOW FUTURE first to preview the consequences.',
  },
  {
    icon: <Compass size={26} color="#49e7ff" />,
    title: 'Weave orbits with the Loom',
    body: 'The LOOM tool fits conic ellipses to your pen strokes. Tune periapsis with the glowing handles, then commit the orbit to a body or an engineered ring.',
  },
  {
    icon: <BookOpen size={26} color="#d4a373" />,
    title: 'Fork time, consult canon',
    body: 'Fork the timeline before bold experiments, compare branches side by side, and invoke source-backed Starsilk mechanisms from the Canon Lab — with honest provenance badges throughout.',
  },
];

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete, onSkip }) => {
  const ref = useModalA11y<HTMLDivElement>(onSkip, { closeOnEscape: true });
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div
        ref={ref}
        className="modal-panel onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome tour"
        tabIndex={-1}
      >
        <button className="onboarding-skip" onClick={onSkip} aria-label="Skip tour">
          <X size={16} />
        </button>
        <div className="onboarding-icon">{current.icon}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-body">{current.body}</p>
        <div className="onboarding-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
          ))}
        </div>
        <div className="onboarding-actions">
          <button
            className="btn-secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft size={14} /> Back
          </button>
          {isLast ? (
            <button className="btn-primary" onClick={onComplete}>
              Begin Architecting
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
