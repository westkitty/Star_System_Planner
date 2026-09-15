import React, { useState } from 'react';

const BEATS = [
  {
    title: 'PEN CONSTRUCTS · FINGERS NAVIGATE',
    body: 'Draw an orbit stroke with the S Pen while the Orbit Loom tool is live — the physics core fits a Keplerian conic to your gesture. Two fingers always orbit and pinch the camera.',
  },
  {
    title: 'THE FUTURE IS COMPUTED',
    body: 'The offscreen worker projects every body forward and, with the sensitivity lattice on, fans 30 slightly-perturbed twin futures of your selection. Toggle lenses on the right rail.',
  },
  {
    title: 'CATASTROPHES ARE REVERSIBLE',
    body: 'Collisions and Roche fragmentations land in the Causal Ledger with full context — and the UNDO bank lets you recall the last stable configuration. Fork branches to explore parallel consequences.',
  },
];

export const QuickTour: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [idx, setIdx] = useState(0);
  const beat = BEATS[idx];
  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <div className="tour-step-mark">{idx + 1} / {BEATS.length}</div>
        <div className="modal-title" style={{ marginTop: 6 }}>{beat.title}</div>
        <p className="tour-body">{beat.body}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="ui-button ghost" onClick={onDone}>Skip</button>
          <button
            className="ui-button primary"
            onClick={() => (idx + 1 < BEATS.length ? setIdx(idx + 1) : onDone())}
          >
            {idx + 1 < BEATS.length ? 'Next' : 'Enter the System'}
          </button>
        </div>
      </div>
    </div>
  );
};
