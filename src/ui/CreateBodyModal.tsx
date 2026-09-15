import React, { useState } from 'react';
import { BodyType, CelestialBody, PlanetClassification } from '../simulation/types';
import { KM_PER_AU, SOLAR_MASS_KG, EARTH_MASS_KG, MOON_MASS_KG, JUPITER_MASS_KG, G_KM } from '../simulation/units';
import { X, Globe, Sun, Moon, Radio } from 'lucide-react';

interface CreateBodyModalProps {
  existingBodies: CelestialBody[];
  onSpawnBody: (body: CelestialBody) => void;
  /** Live ghost-circle preview while sculpting orbital distance. */
  onOrbitRadiusPreview?: (radiusKm: number, primary: CelestialBody | null) => void;
  onClose: () => void;
}

export const CreateBodyModal: React.FC<CreateBodyModalProps> = ({
  existingBodies,
  onSpawnBody,
  onOrbitRadiusPreview,
  onClose,
}) => {
  const [name, setName] = useState('New Planet');
  const [type, setType] = useState<BodyType>('planet');
  const [classification, setClassification] = useState<PlanetClassification>('rocky');
  const [primaryId, setPrimaryId] = useState<string>(
    existingBodies.find(b => b.type === 'star')?.id || (existingBodies[0]?.id ?? '')
  );
  const [distanceAu, setDistanceAu] = useState<number>(1.2);

  // Live ghost-circle preview of the candidate orbit radius
  React.useEffect(() => {
    if (!onOrbitRadiusPreview) return;
    const prim = existingBodies.find(b => b.id === primaryId) || null;
    onOrbitRadiusPreview(distanceAu * KM_PER_AU, prim);
  }, [distanceAu, primaryId, existingBodies, onOrbitRadiusPreview]);

  React.useEffect(() => {
    return () => { onOrbitRadiusPreview?.(0, null); };
  }, [onOrbitRadiusPreview]);

  const handleCreate = () => {
    const primary = existingBodies.find(b => b.id === primaryId);
    const distKm = distanceAu * KM_PER_AU;

    let mass = EARTH_MASS_KG;
    let radius = 6371;
    let color = '#4488ee';
    let luminosityW: number | undefined;

    if (type === 'star') {
      mass = SOLAR_MASS_KG;
      radius = 696000;
      color = '#ffcc00';
      luminosityW = 3.828e26;
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

    // In a truly empty system, anchor the new seed body at the origin
    if (!primary && existingBodies.length === 0) {
      posX = 0;
      posY = 0;
      posZ = 0;
    }

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

    const newBody: CelestialBody = {
      id: `body-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Celestial Object',
      type,
      classification: type === 'planet' ? classification : undefined,
      massKg: mass,
      radiusKm: radius,
      luminosityW,
      color,
      primaryId: primary ? primary.id : null,
      position: { x: posX, y: posY, z: posZ },
      velocity: { x: velX, y: velY, z: velZ },
      canonClassification: 'NON-CANON SANDBOX',
    };

    onSpawnBody(newBody);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(3, 5, 10, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="hud-interactive"
    >
      <div style={{
        background: '#07131e',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding: '18px',
        width: '380px',
        maxWidth: '90vw',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
            CREATE CELESTIAL BODY
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
