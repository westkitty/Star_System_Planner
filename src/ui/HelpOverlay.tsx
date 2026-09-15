import React from 'react';
import { ModalShell } from './ModalShell';

const ROWS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Pause / resume time' },
  { keys: 'V / G / L', action: 'Select · Grab & Throw · Orbit Loom tools' },
  { keys: 'C', action: 'Open body creation' },
  { keys: 'B', action: 'Body directory (search & jump)' },
  { keys: 'F', action: 'Focus camera on selected body' },
  { keys: 'R', action: 'Reset camera · frame entire system' },
  { keys: 'X / T / N / H', action: 'Toggle X-Ray · Trails · Labels · Habitable Zone' },
  { keys: '[  ]', action: 'Quarter / quadruple time warp' },
  { keys: 'Ctrl+Z', action: 'Recall last structure change (undo bank)' },
  { keys: '?', action: 'This chart' },
  { keys: 'Esc', action: 'Layered cancel: modal → loom stroke → grab → selection' },
];

export const HelpOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <ModalShell title="CONTROL GRAMMAR" subtitle="S Pen, mouse & touch all resolve through the same intent layer" onClose={onClose} width={460}>
    <div className="help-grid">
      {ROWS.map(r => (
        <React.Fragment key={r.keys}>
          <span className="help-keys">{r.keys}</span>
          <span className="help-action">{r.action}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="setting-hint" style={{ marginTop: 16 }}>
      S Pen barrel button = instant grab of the body under the nib. Double-tap a body = focus it.
      Two fingers always navigate the camera; the pen always constructs.
    </div>
  </ModalShell>
);
