import React, { useState, useRef, useEffect } from 'react';
import { CANON_MACROS, CanonMacro } from '../canon/macros';
import { CANON_MANIFEST } from '../canon/manifest';
import { CelestialBody } from '../simulation/types';
import { HoldToConfirmController } from '../interaction/hold-to-confirm';
import { X, ExternalLink, Sparkles, ShieldAlert } from 'lucide-react';
import { useModalA11y } from './modal-a11y';

interface CanonLabModalProps {
  selectedBody: CelestialBody | null;
  allBodies: CelestialBody[];
  onExecuteMacro: (macro: CanonMacro, targetBodyId?: string) => void;
  onSpawnTemplateWorld: (template: any) => void;
  onClose: () => void;
}

export const CanonLabModal: React.FC<CanonLabModalProps> = ({
  selectedBody,
  allBodies,
  onExecuteMacro,
  onSpawnTemplateWorld,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'macros' | 'worldsvault' | 'provenance'>('macros');

  // Hold-to-confirm state for dangerous macros
  const [holdingMacroId, setHoldingMacroId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdControllerRef = useRef<HoldToConfirmController | null>(null);

  const startHold = (macro: CanonMacro, targetId?: string) => {
    setHoldingMacroId(macro.id);
    setHoldProgress(0);

    holdControllerRef.current?.destroy();
    const ctrl = new HoldToConfirmController({
      durationMs: macro.holdDurationMs || 1800,
      onProgress: (p) => setHoldProgress(p),
      onComplete: () => {
        setHoldingMacroId(null);
        setHoldProgress(0);
        onExecuteMacro(macro, targetId || selectedBody?.id);
      },
    });
    holdControllerRef.current = ctrl;
    ctrl.startHold();
  };

  const cancelHold = () => {
    holdControllerRef.current?.cancelHold();
    setHoldingMacroId(null);
    setHoldProgress(0);
  };

  useEffect(() => {
    return () => {
      holdControllerRef.current?.destroy();
    };
  }, []);

  const starCount = allBodies.filter(b => b.type === 'star').length;
  const modalRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="modal-backdrop hud-interactive" onClick={onClose}>
      <div
        ref={modalRef}
        className="canon-lab-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Starsilk canon laboratory"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#0cc6ff" />
            <h2 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-primary)', margin: 0 }}>
              STARSILK CANON LABORATORY
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          <button
            onClick={() => setActiveTab('macros')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 700,
              background: activeTab === 'macros' ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.7)',
              color: activeTab === 'macros' ? 'var(--accent-azure)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === 'macros' ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            MACROS & INTERVENTIONS
          </button>
          <button
            onClick={() => setActiveTab('worldsvault')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 700,
              background: activeTab === 'worldsvault' ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.7)',
              color: activeTab === 'worldsvault' ? 'var(--accent-azure)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === 'worldsvault' ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            WORLDSVAULT TEMPLATES
          </button>
          <button
            onClick={() => setActiveTab('provenance')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: 700,
              background: activeTab === 'provenance' ? 'rgba(12, 198, 255, 0.15)' : 'rgba(7, 19, 30, 0.7)',
              color: activeTab === 'provenance' ? 'var(--accent-azure)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === 'provenance' ? 'var(--accent-azure)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            PROVENANCE & LOCKS
          </button>
        </div>

        {/* Tab 1: Macros & Interventions */}
        {activeTab === 'macros' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Cosmological mechanisms operate above Newtonian simulation. Interventions permanently mutate the active branch and stamp causal ledger entries.
            </div>

            {CANON_MACROS.map((macro) => {
              const targetStar = (selectedBody && selectedBody.type === 'star') ? selectedBody : allBodies.find(b => b.type === 'star');
              const targetPlanet = (selectedBody && selectedBody.type === 'planet') ? selectedBody : allBodies.find(b => b.type === 'planet');
              const effectiveTarget = macro.requiresStar ? targetStar : (macro.requiresPlanet ? targetPlanet : selectedBody);

              const disabledStar = macro.requiresStar && !targetStar;
              const disabledMultiStar = macro.requiresMultipleStars && starCount < 2;
              const disabledPlanet = macro.requiresPlanet && !targetPlanet;
              const isDisabled = disabledStar || disabledMultiStar || disabledPlanet;

              return (
                <div key={macro.id} className="macro-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent-azure)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{macro.label}</span>
                        {effectiveTarget && (macro.requiresStar || macro.requiresPlanet) && (
                          <span style={{ fontSize: '10px', color: '#0cc6ff', fontWeight: 600 }}>
                            [TARGET: {effectiveTarget.name.toUpperCase()}]
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#49e7ff', fontWeight: 600 }}>{macro.plannerClassification}</span>
                        <span>SOURCE CANON: <code style={{ color: '#94a3b8' }}>{macro.sourceCanonStatus}</code></span>
                        <span>STABLE ID: <code>{macro.stableId}</code></span>
                      </div>
                    </div>

                    <a
                      href={macro.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px' }}
                      title="Inspect authoritative Compendium citation"
                    >
                      <span>SOURCE</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>

                  {macro.demonstrativeNotice && (
                    <div style={{ fontSize: '10px', color: '#ffaa00', background: 'rgba(255, 170, 0, 0.1)', padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(255, 170, 0, 0.3)' }}>
                      {macro.demonstrativeNotice}
                    </div>
                  )}

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {macro.description}
                  </div>

                  {isDisabled && (
                    <div style={{ fontSize: '10px', color: '#ffaa00', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldAlert size={12} />
                      {macro.requiresStar && 'Requires a star in the system.'}
                      {macro.requiresMultipleStars && 'Requires at least two stars in the active system.'}
                      {macro.requiresPlanet && 'Requires a planet in the system.'}
                    </div>
                  )}

                  {!isDisabled && (
                    <div style={{ marginTop: '4px' }}>
                      {macro.holdDurationMs ? (
                        <button
                          className="macro-hold-button"
                          onPointerDown={() => startHold(macro, effectiveTarget?.id)}
                          onPointerUp={cancelHold}
                          onPointerLeave={cancelHold}
                          title="Press and hold deliberately to complete intervention"
                        >
                          {holdingMacroId === macro.id && (
                            <div
                              className="macro-hold-progress"
                              style={{ width: `${(holdProgress * 100).toFixed(1)}%` }}
                            />
                          )}
                          <span style={{ position: 'relative', zIndex: 2 }}>
                            {holdingMacroId === macro.id
                              ? `EXTRACTING... ${Math.round(holdProgress * 100)}% (RELEASE TO CANCEL)`
                              : `HOLD TO EXECUTE: ${macro.label}`}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onExecuteMacro(macro, effectiveTarget?.id)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            background: '#03050a',
                            border: '1px solid var(--accent-azure)',
                            color: 'var(--accent-azure)',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          APPLY {macro.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: WorldsVault Templates */}
        {activeTab === 'worldsvault' && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Published templates from WorldsVault. Coordinates and spatial positions between templates are explicitly unauthored.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {CANON_MANIFEST.entities.worldsvaultTemplates.namedTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  style={{
                    background: 'rgba(7, 19, 30, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {tmpl.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {tmpl.trait}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onSpawnTemplateWorld(tmpl);
                      onClose();
                    }}
                    style={{
                      background: 'rgba(12, 198, 255, 0.12)',
                      border: '1px solid var(--accent-azure)',
                      color: 'var(--accent-azure)',
                      padding: '5px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + SPAWN IN SYSTEM
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Provenance & Locks */}
        {activeTab === 'provenance' && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'rgba(7, 19, 30, 0.8)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Authority & Boundary Notice
              </div>
              <div>{CANON_MANIFEST.authorityNotice}</div>
              <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                Retrieved from: <code>{CANON_MANIFEST.sourceBaseUrl}</code>
              </div>
            </div>

            <div style={{ background: 'rgba(7, 19, 30, 0.8)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Active Machine-Enforced Locks
              </div>
              <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {CANON_MANIFEST.locks.summary.slice(0, 6).map((lock) => (
                  <li key={lock.lockId}>
                    <strong>{lock.lockId}</strong>: {lock.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
