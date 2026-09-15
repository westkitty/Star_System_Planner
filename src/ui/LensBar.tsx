import React from 'react';
import { Tags, Wind, Droplets, ScanEye, Camera, HelpCircle } from 'lucide-react';

interface LensBarProps {
  showLabels: boolean;
  showTrails: boolean;
  showHabitableZone: boolean;
  showXRay: boolean;
  onToggle: (key: 'showLabels' | 'showTrails' | 'showHabitableZone' | 'showXRay') => void;
  onOpenPostcard: () => void;
  onOpenHelp: () => void;
}

const LENSES = [
  { key: 'showLabels' as const, label: 'NAMES', title: 'Body name sprites (N)', Icon: Tags },
  { key: 'showTrails' as const, label: 'TRAILS', title: 'Recorded path history (T)', Icon: Wind },
  { key: 'showHabitableZone' as const, label: 'HABITABLE', title: 'Habitable-zone annulus (H)', Icon: Droplets },
  { key: 'showXRay' as const, label: 'X-RAY', title: 'Hill sphere, Roche shell & Lagrange markers on selection (X)', Icon: ScanEye },
];

/** Right-edge lens rail: the render-layer switching community, one tap each. */
export const LensBar: React.FC<LensBarProps> = (props) => {
  const flags: Record<string, boolean> = {
    showLabels: props.showLabels,
    showTrails: props.showTrails,
    showHabitableZone: props.showHabitableZone,
    showXRay: props.showXRay,
  };
  return (
    <div className="lens-bar hud-interactive">
      {LENSES.map(({ key, label, title, Icon }) => (
        <button
          key={key}
          className={`lens-button ${flags[key] ? 'active' : ''}`}
          title={title}
          aria-pressed={flags[key]}
          onClick={() => props.onToggle(key)}
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
      <div className="lens-divider" />
      <button className="lens-button" title="Capture System Postcard (PNG)" onClick={props.onOpenPostcard}>
        <Camera size={15} />
        <span>POSTCARD</span>
      </button>
      <button className="lens-button" title="Control grammar (?)" onClick={props.onOpenHelp}>
        <HelpCircle size={15} />
        <span>HELP</span>
      </button>
    </div>
  );
};
