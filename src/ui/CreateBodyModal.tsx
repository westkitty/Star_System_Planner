import React, { useMemo, useState } from 'react';
import { BodyType, CelestialBody, PlanetClassification } from '../simulation/types';
import { KM_PER_AU, SOLAR_MASS_KG, EARTH_MASS_KG, MOON_MASS_KG, JUPITER_MASS_KG, G_KM } from '../simulation/units';
import { SPECTRAL_CLASSES, SpectralLetter } from '../rendering/star-palette';
import { calculateHabitableZone } from '../simulation/thermal';
import { formatSimTime } from '../simulation/units';
import { X, Globe, Sun, Moon, Radio, FlaskConical } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

/**
 * Pre-spawn orbital preview (UI13): predicted period, equilibrium
 * temperature, and habitable-zone verdict update live as the architect
 * tunes distance and primary — no more blind spawns.
 */
function SpawnPreview(props: {
  primary: CelestialBody | null;
  distanceAu: number;
  type: BodyType;
}): React.ReactElement | null {
  const preview = useMemo(() => {
    const primary = props.primary;
    if (!primary || props.type === 'star') return null;
    const distKm = props.distanceAu * KM_PER_AU;
    if (!(distKm > 0) || !(primary.massKg > 0)) return null;
    const periodSec = 2 * Math.PI * Math.sqrt(Math.pow(distKm, 3) / (G_KM * primary.massKg));
    // Fast equilibrium estimate (albedo 0.3, no greenhouse).
    const lum = primary.luminosityW ?? 0;
    const flux = lum > 0 ? lum / (4 * Math.PI * Math.pow(distKm * 1000, 2)) : 0;
    const tempK = flux > 0 ? Math.pow((flux * (1 - 0.3)) / (4 * 5.670374419e-8), 0.25) : 0;
    const hz = calculateHabitableZone(primary);
    const verdict = !hz
      ? 'No habitable zone'
      : distKm < hz.innerRadiusKm
        ? 'Inside inner edge — hot'
        : distKm > hz.outerRadiusKm
          ? 'Beyond outer edge — cold'
          : 'Inside the habitable zone';
    const good = hz !== null && distKm >= hz.innerRadiusKm && distKm <= hz.outerRadiusKm;
    return { periodSec, tempK, verdict, good };
  }, [props.primary, props.distanceAu, props.type]);

  if (!preview) return null;
  return (
    <div className="spawn-preview" aria-live="polite">
      <div className="spawn-preview-title">
        <FlaskConical size={13} /> Spawn preview
      </div>
      <div className="spawn-preview-grid">
        <span>Period</span>
        <strong>{formatSimTime(preview.periodSec)}</strong>
        <span>Equilibrium</span>
        <strong>{preview.tempK > 0 ? `${Math.round(preview.tempK)} K` : '—'}</strong>
        <span>Verdict</span>
        <strong style={{ color: preview.good ? '#44ee88' : '#ffd166' }}>{preview.verdict}</strong>
      </div>
    </div>
  );
}

interface CreateBodyModalProps {
  existingBodies: CelestialBody[];
  onSpawnBody: (body: CelestialBody) => void;
  onClose: () => void;
}

export const CreateBodyModal: React.FC<CreateBodyModalProps> = ({
  existingBodies,
  onSpawnBody,
  onClose,
}) => {
  const [name, setName] = useState('New Planet');
  const [type, setType] = useState<BodyType>('planet');
  const [classification, setClassification] = useState<PlanetClassification>('rocky');
  const [spectralLetter, setSpectralLetter] = useState<SpectralLetter>('G');
  const modalRef = useModalA11y<HTMLDivElement>(onClose);
  const [primaryId, setPrimaryId] = useState<string>(
    existingBodies.find(b => b.type === 'star')?.id || (existingBodies[0]?.id ?? '')
  );
  const [distanceAu, setDistanceAu] = useState<number>(1.2);

  const handleCreate = () => {
    const primary = existingBodies.find(b => b.id === primaryId);
    const distKm = distanceAu * KM_PER_AU;

    let mass = EARTH_MASS_KG;
    let radius = 6371;
    let color = '#4488ee';
    let luminosityW: number | undefined;

    if (type === 'star') {
      // ASSET01: honest spectral-class anchors for mass/radius/luminosity.
      const spectral = SPECTRAL_CLASSES.find((c) => c.class === spectralLetter) ?? SPECTRAL_CLASSES[4];
      mass = spectral.massSolar * SOLAR_MASS_KG;
      radius = spectral.radiusSolar * 696340;
      color = spectral.color;
      luminosityW = spectral.luminositySolar * 3.828e26;
    } else if (type === 'moon') {
      mass = MOON_MASS_KG;
      radius = 1737;
      color = '#99a3b0';
    } else if (type === 'station') {
      mass = 1e9;
      radius = 80;
      color = '#ffffff';
    } else if (classification === 'gas_giant') {
      mass = JUPITER_MASS_KG;
      radius = 70000;
      color = '#d4a373';
    } else if (classification === 'oceanic') {
      mass = EARTH_MASS_KG * 1.2;
      radius = 6800;
      color = '#1b64b3';
    } else if (classification === 'desert') {
      mass = EARTH_MASS_KG * 0.7;
      radius = 5400;
      color = '#e07a5f';
    }

    // Determine position and stable circular velocity
    let posX = distKm;
    let posY = 0;
    let posZ = 0;
    let velX = 0;
    let velY = 0;
    let velZ = 0;

    if (primary) {
      posX = primary.position.x + distKm;
      posY = primary.position.y;
      posZ = primary.position.z;

      // v = sqrt(G * M / r)
      const vCirc = Math.sqrt((G_KM * primary.massKg) / distKm);
      velX = primary.velocity.x;
      velY = primary.velocity.y;
      velZ = primary.velocity.z + vCirc;
    }

    const spectral = SPECTRAL_CLASSES.find((c) => c.class === spectralLetter) ?? SPECTRAL_CLASSES[4];
    const newBody: CelestialBody = {
      id: `body-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Celestial Object',
      type,
      classification: type === 'planet' ? classification : undefined,
      massKg: mass,
      radiusKm: radius,
      luminosityW,
      color,
      temperatureK: type === 'star' ? spectral.temperatureK : undefined,
      primaryId: primary ? primary.id : null,
      position: { x: posX, y: posY, z: posZ },
      velocity: { x: velX, y: velY, z: velZ },
      canonClassification: 'NON-CANON SANDBOX',
      ...(type === 'star' ? { spectralClass: spectralLetter } : {}),
    } as CelestialBody;

    onSpawnBody(newBody);
    onClose();
  };

  return (
    <div className="modal-backdrop hud-interactive" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Create celestial body"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-row">
          <h3 className="modal-title">
            CREATE CELESTIAL BODY
          </h3>
          <button onClick={onClose} className="modal-x" aria-label="Close create body">
            <X size={16} />
          </button>
        </div>

        {/* Type Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
          {[
            { id: 'star', label: 'Star', icon: Sun },
            { id: 'planet', label: 'Planet', icon: Globe },
            { id: 'moon', label: 'Moon', icon: Moon },
            { id: 'station', label: 'Station', icon: Radio },
          ].map((item) => {
            const Icon = item.icon;
            const isSel = type === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setType(item.id as BodyType)}
                style={{
                  background: isSel ? 'var(--accent-azure)' : 'rgba(3, 5, 10, 0.6)',
                  color: isSel ? '#03050a' : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Name Input */}
        <div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              background: '#03050a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              padding: '8px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>

        {/* Spectral class picker for stars (ASSET01) */}
        {type === 'star' && (
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Spectral Class
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }} role="radiogroup" aria-label="Spectral class">
              {SPECTRAL_CLASSES.map((c) => (
                <button
                  key={c.class}
                  role="radio"
                  aria-checked={spectralLetter === c.class}
                  title={c.label}
                  onClick={() => setSpectralLetter(c.class)}
                  style={{
                    background: spectralLetter === c.class ? c.color : 'rgba(3, 5, 10, 0.6)',
                    color: spectralLetter === c.class ? '#03050a' : c.color,
                    border: `1px solid ${c.color}`,
                    borderRadius: '6px',
                    padding: '7px 0',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {c.class}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {(SPECTRAL_CLASSES.find((c) => c.class === spectralLetter) ?? SPECTRAL_CLASSES[4]).label}
            </div>
          </div>
        )}

        {/* Classification if planet */}
        {type === 'planet' && (
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Classification
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as PlanetClassification)}
              style={{
                width: '100%',
                background: '#03050a',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '8px',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              <option value="rocky">Rocky Terrestrial</option>
              <option value="oceanic">Oceanic / Water World</option>
              <option value="desert">Arid Desert</option>
              <option value="ice">Glacial Ice World</option>
              <option value="gas_giant">Jovian Gas Giant</option>
              <option value="scorched">Scorched Volcanic</option>
            </select>
          </div>
        )}

        {/* Primary Selector */}
        {existingBodies.length > 0 && type !== 'star' && (
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Orbit Primary
            </label>
            <select
              value={primaryId}
              onChange={(e) => setPrimaryId(e.target.value)}
              style={{
                width: '100%',
                background: '#03050a',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '8px',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              {existingBodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.type})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Orbital Distance */}
        {existingBodies.length > 0 && type !== 'star' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span>Orbital Distance</span>
              <span style={{ color: 'var(--accent-azure)', fontFamily: 'var(--font-mono)' }}>
                {distanceAu.toFixed(2)} AU ({Math.round(distanceAu * KM_PER_AU).toLocaleString()} km)
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="6.0"
              step="0.05"
              value={distanceAu}
              onChange={(e) => setDistanceAu(parseFloat(e.target.value))}
              className="tactile-slider"
            />
          </div>
        )}

        <SpawnPreview
          primary={existingBodies.find((b) => b.id === primaryId) ?? null}
          distanceAu={distanceAu}
          type={type}
        />

        {/* Commit Button */}
        <button
          onClick={handleCreate}
          style={{
            background: 'var(--accent-azure)',
            color: '#03050a',
            border: 'none',
            borderRadius: '6px',
            padding: '10px',
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            marginTop: '6px',
          }}
        >
          SPAWN INTO ORBIT
        </button>
      </div>
    </div>
  );
};
