import React from 'react';
import { formatDistance, formatVelocity } from '../simulation/units';
import { Crosshair, TrendingUp, AlertTriangle } from 'lucide-react';

interface AimChipProps {
  readout: {
    bound: boolean;
    speedKmS: number;
    periapsisKm: number;
    impact: boolean;
  };
}

/** Live osculating-element readout rendered while a Grab & Throw is in flight. */
export const AimChip: React.FC<AimChipProps> = ({ readout }) => {
  const tone = readout.impact ? 'impact' : readout.bound ? 'bound' : 'escape';
  return (
    <div className={`aim-chip aim-${tone}`}>
      {readout.impact ? <AlertTriangle size={14} /> : readout.bound ? <Crosshair size={14} /> : <TrendingUp size={14} />}
      <div>
        <div className="aim-state">
          {readout.impact ? 'IMPACT TRAJECTORY' : readout.bound ? 'BOUND ORBIT' : 'ESCAPE VECTOR'}
        </div>
        <div className="aim-numbers">
          {formatVelocity(readout.speedKmS)} · periapsis {formatDistance(readout.periapsisKm)}
        </div>
      </div>
    </div>
  );
};
