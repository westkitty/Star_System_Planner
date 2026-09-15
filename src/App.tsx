import React, { useEffect, useRef, useState } from 'react';
import { SceneManager, CameraSnapshot } from './rendering/scene-manager';
import { SimulationEngine } from './simulation/engine';
import { PointerManager, PointerToolMode } from './interaction/pointer-manager';
import { GrabAndThrowController } from './interaction/grab-and-throw';
import { OrbitLoom, FittedOrbit } from './interaction/orbit-loom';
import { FutureClient } from './simulation/future-client';
import { BranchManager } from './branching/branch-manager';
import { CelestialBody, SystemStatus, ConsequenceEvent, SimulationSnapshot } from './simulation/types';
import { ScaleMode } from './rendering/scale-transform';
import { createDemonstrationSystem } from './simulation/presets/demo-system';
import { createMeridianPreset } from './simulation/presets/meridian-preset';
import { createBlankSystem } from './simulation/presets/blank-system';
import { generateSystemSigilSvg } from './persistence/sigil';
import { saveProjectToDb, loadProjectFromDb, listAllProjects, deleteProjectFromDb, DatabaseProjectSummary } from './persistence/db';
import { downloadProjectFile, parseAndValidateProjectJson } from './persistence/export-import';
import { createSerializableProject } from './persistence/serializer';
import { loadUserPrefs, saveUserPrefs, UserPrefs } from './persistence/prefs';
import { audioSynth } from './audio/audio-synth';
import { audibleOrrery } from './audio/orrery';
import { CanonMacro } from './canon/macros';
import { resolvePointerIntent } from './interaction/pointer-intent';
import { findDominantPrimary, calculateOsculatingElements } from './simulation/orbital-mechanics';

import { TopBar, AppMode } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { ContextInspector } from './ui/ContextInspector';
import { TimelineBar } from './ui/TimelineBar';
import { CanonLabModal } from './ui/CanonLabModal';
import { CreateBodyModal } from './ui/CreateBodyModal';
import { EventLedgerModal } from './ui/EventLedgerModal';
import { BranchCompareModal } from './ui/BranchCompareModal';
import { OrbitLoomConfirmModal } from './ui/OrbitLoomConfirmModal';
import { ModalShell } from './ui/ModalShell';
import { NamePromptModal } from './ui/NamePromptModal';
import { SettingsModal } from './ui/SettingsModal';
import { SavesModal } from './ui/SavesModal';
import { BodyPickerModal } from './ui/BodyPickerModal';
import { HelpOverlay } from './ui/HelpOverlay';
import { LensBar } from './ui/LensBar';
import { QuickTour } from './ui/QuickTour';
import { PostcardModal } from './ui/PostcardModal';
import { Toasts } from './ui/Toasts';
import { AimChip } from './ui/AimChip';

// =============================================================================
// Error Boundary — contains renderer crashes instead of a black void
// =============================================================================

interface BoundaryState { error: Error | null; }

class RendererBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  componentDidCatch(error: Error): void { console.error('Planner crash contained:', error); }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="boot-screen">
          <div className="boot-card">
            <div className="brand-title">RENDER CONTAINMENT</div>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 12 }}>
              The renderer hit an unrecoverable fault: {this.state.error.message}
            </p>
            <button className="ui-button primary" style={{ marginTop: 16, alignSelf: 'center' }}
              onClick={() => window.location.reload()}>
              Reinitialize Planner
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Toast helpers
// =============================================================================

export interface ToastItem { id: number; message: string; kind: 'info' | 'warn' | 'ok'; }

let toastSeq = 0;

interface UndoEntry {
  label: string;
  snapshot: SimulationSnapshot;
  camera: CameraSnapshot | null;
}

const UNDO_LIMIT = 12;

// =============================================================================

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Engine and core references
  const engineRef = useRef<SimulationEngine | null>(null);
  const sceneRef = useRef<SceneManager | null>(null);
  const branchManagerRef = useRef<BranchManager | null>(null);
  const grabThrowRef = useRef<GrabAndThrowController | null>(null);
  const orbitLoomRef = useRef<OrbitLoom | null>(null);
  const futureClientRef = useRef<FutureClient | null>(null);
  const pointerManagerRef = useRef<PointerManager | null>(null);
  const hiddenRef = useRef(false);

  // UI State
  const [projectName, setProjectName] = useState('Kallisto Demonstration System');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('active');
  const [mode, setMode] = useState<AppMode>('SIMULATE');
  const [activeTool, setActiveTool] = useState<PointerToolMode>('select');
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('readable');
  const [collisionsEnabled, setCollisionsEnabled] = useState(true);
  const [gravityGridVisible, setGravityGridVisible] = useState(false);
  const [showFuture, setShowFuture] = useState(true);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [sigilSvg, setSigilSvg] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [bootReady, setBootReady] = useState(false);
  const [restoredFromSave, setRestoredFromSave] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);

  // Aim readout for grab & throw (osculating elements under cursor velocity)
  const [aimReadout, setAimReadout] = useState<null | {
    bound: boolean; speedKmS: number; periapsisKm: number; impact: boolean;
  }>(null);

  // Undo stack (catastrophe reversal)
  const undoStackRef = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Rolling pre-catastrophe checkpoint (~15 s cadence while stable)
  const autoCheckpointRef = useRef<SimulationSnapshot | null>(null);

  // Orbit Loom pending fitted orbit
  const [pendingOrbit, setPendingOrbit] = useState<FittedOrbit | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCanonLabOpen, setIsCanonLabOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavesOpen, setIsSavesOpen] = useState(false);
  const [isBodyPickerOpen, setIsBodyPickerOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isPostcardOpen, setIsPostcardOpen] = useState(false);
  const [branchPromptOpen, setBranchPromptOpen] = useState(false);
  const [renamePromptOpen, setRenamePromptOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; kind: 'body' | 'save' } | null>(null);

  // Saved projects list
  const [saves, setSaves] = useState<DatabaseProjectSummary[]>([]);

  // Timeline Branches
  const [branches, setBranches] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('branch-prime');

  // User preferences (persisted localStorage)
  const [prefs, setPrefs] = useState<UserPrefs>(() => loadUserPrefs());
  const prefsRef = useRef<UserPrefs>(prefs);
  prefsRef.current = prefs;

  // Trigger helper for state sync
  const [, setFrameCount] = useState(0);

  // === STABLE STATE BRIDGE REFS ===
  const activeToolRef = useRef<PointerToolMode>(activeTool);
  activeToolRef.current = activeTool;
  const isPausedRef = useRef<boolean>(isPaused);
  isPausedRef.current = isPaused;
  const showFutureRef = useRef<boolean>(showFuture);
  showFutureRef.current = showFuture;
  const showSensitivityRef = useRef<boolean>(showSensitivity);
  showSensitivityRef.current = showSensitivity;
  const selectedBodyIdRef = useRef<string | null>(selectedBodyId);
  selectedBodyIdRef.current = selectedBodyId;
  const projectNameRef = useRef<string>(projectName);
  projectNameRef.current = projectName;
  const scaleModeRef = useRef<ScaleMode>(scaleMode);
  scaleModeRef.current = scaleMode;
  const collisionsEnabledRef = useRef<boolean>(collisionsEnabled);
  collisionsEnabledRef.current = collisionsEnabled;
  const timeScaleRef = useRef<number>(timeScale);
  timeScaleRef.current = timeScale;

  // --- Forecast option builder honoring user-pref depth & jitter ---
  const forecastOpts = (selectedId: string | null, sensitivity: boolean) => {
    const stepsByHorizon: Record<UserPrefs['forecastHorizon'], number> = {
      near: 120,      // dt 300s → ~10 h
      standard: 288,  // ~24 h
      deep: 864,      // ~72 h
    };
    return {
      selectedBodyId: selectedId,
      calculateSensitivity: sensitivity,
      steps: stepsByHorizon[prefsRef.current.forecastHorizon] ?? 288,
      perturbFraction: prefsRef.current.perturbPercent / 100,
    };
  };

  // --- Toast bus ---
  const pushToast = (message: string, kind: ToastItem['kind'] = 'info') => {
    toastSeq += 1;
    const id = toastSeq;
    setToasts(t => [...t.slice(-4), { id, message, kind }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  };

  // --- Prefs persistence ---
  const updatePrefs = (patch: Partial<UserPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };
      saveUserPrefs(next);
      return next;
    });
  };

  // Apply prefs to render/audio layers (idempotent).
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      scene.trailRenderer.enabled = prefs.showTrails;
      scene.labelRenderer.enabled = prefs.showLabels;
      scene.xrayLens.enabled = prefs.showXRay;
      scene.habitableZone.enabled = prefs.showHabitableZone;
      scene.trailRenderer.setMaxPoints(prefs.trailLengthPoints);
      scene.cameraSensitivity = prefs.cameraSensitivity;
      scene.setRenderQuality(prefs.renderQuality);
    }
    audioSynth.isEnabled = prefs.audioEnabled;
    audibleOrrery.setEnabled(prefs.orreryEnabled);
    // Forecast depth/jitter are applied per-request via forecastOpts()
    if (engineRef.current) {
      engineRef.current.enableRocheBreaking = prefs.rocheBreaking;
    }
  }, [prefs]);

  // --- Snapshot undo (catastrophe reversal) ---
  const pushUndo = (label: string) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !branchManagerRef.current) return;
    const snap = branchManagerRef.current.captureSnapshotOf(engine);
    undoStackRef.current.push({
      label,
      snapshot: snap,
      camera: scene ? scene.captureCamera() : null,
    });
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setCanUndo(true);
  };

  const handleUndo = () => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    const entry = undoStackRef.current.pop();
    if (!entry || !engine || !scene) { setCanUndo(false); return; }
    engine.restoreSnapshot(entry.snapshot);
    scene.syncBodies(engine.bodies);
    scene.purgeDynamicOverlays();
    if (entry.camera) scene.restoreCamera(entry.camera);
    setSystemStatus(engine.systemStatus);
    setEventCount(engine.events.length);
    setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engine.bodies));
    setCanUndo(undoStackRef.current.length > 0);
    audioSynth.playUndoSweep();
    pushToast(`Reverted: ${entry.label}`, 'ok');
  };

  // Cleanup tool actions on tool switch
  useEffect(() => {
    if (activeTool !== 'orbit_loom') {
      orbitLoomRef.current?.clear();
      setPendingOrbit(null);
    }
    if (activeTool !== 'grab_throw') {
      grabThrowRef.current?.cancelGrab();
      setAimReadout(null);
    }
    if (activeTool === 'orbit_loom' && orbitLoomRef.current && engineRef.current) {
      const selected = engineRef.current.bodies.find(b => b.id === selectedBodyIdRef.current);
      const star = engineRef.current.bodies.find(b => b.type === 'star') || engineRef.current.bodies[0];
      orbitLoomRef.current.setPrimary(selected?.type === 'star' ? selected : star);
    }
  }, [activeTool]);

  // Sensitivity / future toggle reaction
  useEffect(() => {
    if (showFuture && futureClientRef.current && engineRef.current) {
      futureClientRef.current.requestForecast(engineRef.current.bodies, {
        ...forecastOpts(selectedBodyIdRef.current, showSensitivity),
      }, true);
    }
  }, [showFuture, showSensitivity]);

  // Keyboard shortcuts: true Esc grammar + tool letter keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Esc grammar: modal > loom stroke > grab > selection
      if (e.key === 'Escape') {
        if (isHelpOpen) { setIsHelpOpen(false); return; }
        if (isBodyPickerOpen) { setIsBodyPickerOpen(false); return; }
        if (isSettingsOpen) { setIsSettingsOpen(false); return; }
        if (isSavesOpen) { setIsSavesOpen(false); return; }
        if (isCreateModalOpen) { setIsCreateModalOpen(false); return; }
        if (isLedgerOpen) { setIsLedgerOpen(false); return; }
        if (isCompareOpen) { setIsCompareOpen(false); return; }
        if (isCanonLabOpen) { setIsCanonLabOpen(false); return; }
        if (isPostcardOpen) { setIsPostcardOpen(false); return; }
        if (branchPromptOpen) { setBranchPromptOpen(false); return; }
        if (renamePromptOpen) { setRenamePromptOpen(false); return; }
        if (deleteConfirm) { setDeleteConfirm(null); return; }
        if (pendingOrbit) { orbitLoomRef.current?.clear(); setPendingOrbit(null); return; }
        if (grabThrowRef.current?.isDragging()) { grabThrowRef.current.cancelGrab(); setAimReadout(null); return; }
        if (selectedBodyIdRef.current) {
          setSelectedBodyId(null);
          selectedBodyIdRef.current = null;
          sceneRef.current?.setSelectedBody(null);
          return;
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleUndo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (key === 'v') setActiveTool('select');
      else if (key === 'g') setActiveTool('grab_throw');
      else if (key === 'l') setActiveTool('orbit_loom');
      else if (key === 'c') setIsCreateModalOpen(true);
      else if (key === 'b') setIsBodyPickerOpen(o => !o);
      else if (key === '?') setIsHelpOpen(o => !o);
      else if (key === ' ') { e.preventDefault(); handleTogglePause(); }
      else if (key === 'f') {
        const body = engineRef.current?.bodies.find(b => b.id === selectedBodyIdRef.current);
        if (body && sceneRef.current) sceneRef.current.focusBody(body, true);
      }
      else if (key === 'r') sceneRef.current?.resetCamera(engineRef.current?.bodies);
      else if (key === 'x') updatePrefs({ showXRay: !prefsRef.current.showXRay });
      else if (key === 't') updatePrefs({ showTrails: !prefsRef.current.showTrails });
      else if (key === 'n') updatePrefs({ showLabels: !prefsRef.current.showLabels });
      else if (key === 'h') updatePrefs({ showHabitableZone: !prefsRef.current.showHabitableZone });
      else if (key === '[') handleSetTimeScale(Math.max(0.25, timeScaleRef.current / 4));
      else if (key === ']') handleSetTimeScale(Math.min(32768, timeScaleRef.current * 4));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Page visibility: block autosave when tab hidden (stale-state contamination fix)
  useEffect(() => {
    const onVisibility = () => { hiddenRef.current = document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // === CORE INITIALIZATION ===
  useEffect(() => {
    if (!canvasRef.current) return;

    const sceneMgr = new SceneManager(canvasRef.current);
    sceneRef.current = sceneMgr;

    const initialPreset = createDemonstrationSystem();
    const engine = new SimulationEngine(initialPreset.bodies, { enableCollisions: true });
    engine.belts = initialPreset.belts;
    engine.enableRocheBreaking = prefsRef.current.rocheBreaking;
    engineRef.current = engine;

    // Catastrophe hook: auto-pause + ambient strike + camera impulse
    engine.onCatastrophe = (ev: ConsequenceEvent) => {
      if (prefsRef.current.autoPauseOnCatastrophe) {
        engine.isPaused = true;
        setIsPaused(true);
        isPausedRef.current = true;
      }
      audibleOrrery.strike(ev.severity === 'catastrophe' ? 0.9 : 0.5);
      audioSynth.playCollisionWarning();
      sceneMgr.impulse(0.55);
      // Undo lands on the most recent stable checkpoint, not the wreckage
      if (autoCheckpointRef.current) {
        undoStackRef.current.push({
          label: `Pre-catastrophe: ${ev.title}`,
          snapshot: autoCheckpointRef.current,
          camera: sceneMgr.captureCamera(),
        });
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
        setCanUndo(true);
      }
      pushToast(ev.title, 'warn');
    };

    const branchMgr = new BranchManager(engine, 'Prime Timeline');
    branchManagerRef.current = branchMgr;
    setBranches(branchMgr.getAllBranches());
    setActiveBranchId(branchMgr.activeBranchId);

    // --- Grab & Throw with live aim readout (osculating elements at cursor) ---
    const grabThrow = new GrabAndThrowController(sceneMgr, {
      onVelocityChanged: (body, vel) => {
        const primary = findDominantPrimary(body, engine.bodies);
        if (primary) {
          const ghost: CelestialBody = { ...body, velocity: vel };
          const el = calculateOsculatingElements(ghost, primary);
          setAimReadout({
            bound: el.isBound,
            speedKmS: Math.hypot(vel.x, vel.y, vel.z),
            periapsisKm: el.periapsisKm,
            impact: el.isBound && el.periapsisKm < primary.radiusKm * 1.15,
          });
        }
        if (showFutureRef.current && futureClientRef.current) {
          futureClientRef.current.requestForecast(engine.bodies, {
            ...forecastOpts(body.id, showSensitivityRef.current),
          });
        }
      },
      onThrowReleased: (body, vel) => {
        audioSynth.playTick();
        setAimReadout(null);
        engine.events.push({
          id: `throw-${Date.now()}`,
          timestampSec: engine.timeSec,
          type: 'throw_released',
          title: `Throw Released: ${body.name}`,
          description: `${body.name} launched with velocity ${Math.hypot(vel.x, vel.y, vel.z).toFixed(1)} km/s into physical space.`,
          bodyIds: [body.id],
          severity: 'info',
        });
        setEventCount(engine.events.length);
        if (showFutureRef.current && futureClientRef.current) {
          futureClientRef.current.requestForecast(engine.bodies, {
            ...forecastOpts(body.id, showSensitivityRef.current),
          }, true);
        }
      },
    });
    grabThrowRef.current = grabThrow;

    const loom = new OrbitLoom(sceneMgr);
    const star = engine.bodies.find(b => b.type === 'star') || engine.bodies[0];
    if (star) loom.setPrimary(star);
    orbitLoomRef.current = loom;

    const futureClient = new FutureClient((response) => {
      for (const [bodyId, points] of Object.entries(response.trajectories)) {
        sceneMgr.trajectoryRenderer.updateBodyTrajectory({
          bodyId,
          points,
          isSelected: bodyId === selectedBodyIdRef.current,
        });
      }
      if (response.sensitivityFans) {
        sceneMgr.trajectoryRenderer.updateSensitivityCloud(response.sensitivityFans);
      }
    });
    futureClientRef.current = futureClient;

    // --- Selection cycling helper ---
    const selectBody = (id: string | null) => {
      setSelectedBodyId(id);
      selectedBodyIdRef.current = id;
      sceneMgr.setSelectedBody(id);
    };

    // --- PointerManager with quick-grab, double-tap focus, wheel zoom ---
    const pointerMgr = new PointerManager(canvasRef.current, {
      onPointerDown: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        const currentTool = activeToolRef.current;
        let hitBodyId = sceneMgr.raycastBody(normX, normY);
        // Forgiving tap radius: cycle through bodies near the tap point
        if (!hitBodyId && e.pointerType !== 'mouse') {
          const near = sceneMgr.raycastBodiesInRadius(normX, normY, 26, canvasRef.current!);
          hitBodyId = near[0] || null;
        }

        const intent = resolvePointerIntent({
          tool: currentTool,
          pointerType: e.pointerType,
          hasHitBody: !!hitBodyId,
          isPaused: isPausedRef.current,
          pointerCount: pointerMgr.getActivePointerCount(),
        });

        if (intent === 'orbit_loom_draw') {
          pointerMgr.isDrawingOrbit = true;
          const selected = engine.bodies.find(b => b.id === selectedBodyIdRef.current);
          const prim = selected?.type === 'star' ? selected : (engine.bodies.find(b => b.type === 'star') || engine.bodies[0]);
          if (prim) loom.setPrimary(prim);
          loom.startStroke();
          loom.addStrokePoint(normX, normY);
          return;
        }

        if (intent === 'grab_throw_manipulate') {
          if (hitBodyId) {
            selectBody(hitBodyId);
            const b = engine.bodies.find(b => b.id === hitBodyId);
            if (b) {
              pointerMgr.isManipulatingObject = true;
              grabThrow.startGrab(b);
            }
          }
          return;
        }

        if (intent === 'select_body') {
          if (hitBodyId) selectBody(hitBodyId);
          return;
        }

        if (intent === 'deselect') {
          selectBody(null);
          return;
        }
        // camera_navigate: ordinary navigation
      },
      onPointerMove: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        if (pointerMgr.isDrawingOrbit) {
          loom.addStrokePoint(normX, normY);
          return;
        }
        if (pointerMgr.isManipulatingObject && grabThrow.isDragging()) {
          grabThrow.updateDrag(normX, normY);
          return;
        }
        if (e.rawEvent.buttons === 1 || e.pointerType === 'touch') {
          sceneMgr.orbitCamera(-e.deltaX, -e.deltaY);
        }
      },
      onPointerUp: () => {
        if (pointerMgr.isDrawingOrbit) {
          pointerMgr.isDrawingOrbit = false;
          const fitted = loom.endStroke();
          if (fitted) {
            audioSynth.playOrbitLock();
            setPendingOrbit(fitted);
          }
        }
        if (pointerMgr.isManipulatingObject) {
          pointerMgr.isManipulatingObject = false;
          grabThrow.releaseThrow();
          setAimReadout(null);
        }
      },
      onPointerCancel: () => {
        pointerMgr.isDrawingOrbit = false;
        pointerMgr.isManipulatingObject = false;
        loom.clear();
        setPendingOrbit(null);
        grabThrow.cancelGrab();
        setAimReadout(null);
      },
      onPinchZoom: (factor) => {
        sceneMgr.zoomCamera(factor);
      },
      onTwoFingerPan: (dx, dy) => {
        sceneMgr.panCamera(dx, dy);
      },
      onWheelZoom: (rawDelta) => {
        sceneMgr.wheelZoom(rawDelta);
      },
      onDoubleTap: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        const hit = sceneMgr.raycastBody(normX, normY);
        if (hit) {
          const body = engine.bodies.find(b => b.id === hit);
          if (body) {
            selectBody(hit);
            sceneMgr.focusBody(body, true);
            audioSynth.playTick();
          }
        }
      },
      onPenQuickAction: (e) => {
        // S Pen barrel button: grab the body under the nib instantly
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        const near = sceneMgr.raycastBodiesInRadius(normX, normY, 30, canvasRef.current!);
        if (near.length > 0) {
          selectBody(near[0]);
          const b = engine.bodies.find(b => b.id === near[0]);
          if (b) {
            setActiveTool('grab_throw');
            pointerMgr.isManipulatingObject = true;
            grabThrow.startGrab(b);
            audioSynth.playTick();
          }
        } else {
          selectBody(null);
        }
      },
    });
    pointerManagerRef.current = pointerMgr;

    setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engine.bodies));
    sceneMgr.syncBodies(engine.bodies);

    // --- STARTUP RESTORE ---
    loadProjectFromDb('system-autosave')
      .then((saved) => {
        if (saved && saved.branches && saved.branches.length > 0 && engineRef.current && sceneRef.current) {
          const activeBranch = saved.branches.find(b => b.id === saved.activeBranchId) || saved.branches[0];
          if (activeBranch && activeBranch.snapshot) {
            engineRef.current.restoreSnapshot(activeBranch.snapshot);
            engineRef.current.events = [...(activeBranch.events || saved.events || [])];
            engineRef.current.systemStatus = saved.systemStatus || activeBranch.snapshot.systemStatus || 'active';
            engineRef.current.enableCollisions = saved.simulationSettings?.enableCollisions ?? true;
            engineRef.current.timeScale = saved.simulationSettings?.timeScale ?? 1.0;

            const bMgr = BranchManager.fromPersisted(saved.branches, saved.activeBranchId);
            branchManagerRef.current = bMgr;
            setBranches(bMgr.getAllBranches());
            setActiveBranchId(bMgr.activeBranchId);

            const pName = saved.projectName || 'Restored System';
            setProjectName(pName);
            projectNameRef.current = pName;
            setSystemStatus(engineRef.current.systemStatus);
            setScaleMode(saved.visualSettings?.scaleMode || 'readable');
            sceneRef.current.scaleTransform.setMode(saved.visualSettings?.scaleMode || 'readable');
            setShowFuture(saved.visualSettings?.showFuture ?? true);
            setShowSensitivity(saved.visualSettings?.showSensitivity ?? false);
            setGravityGridVisible(saved.visualSettings?.showGravityGrid ?? false);
            sceneRef.current.gravityGrid.getMesh().visible = saved.visualSettings?.showGravityGrid ?? false;
            setCollisionsEnabled(saved.simulationSettings?.enableCollisions ?? true);
            setTimeScale(saved.simulationSettings?.timeScale ?? 1.0);
            timeScaleRef.current = saved.simulationSettings?.timeScale ?? 1.0;
            sceneRef.current.syncBodies(engineRef.current.bodies);
            if (saved.cameraState) {
              sceneRef.current.restoreCamera(saved.cameraState);
            }
            setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
            setRestoredFromSave(true);
            setLastSaveTime(new Date(saved.updatedAtIso ?? Date.now()).toLocaleTimeString());
          }
        }
        setBootReady(true);
      })
      .catch(() => { setBootReady(true); });

    // --- Master Animation Loop ---
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameTicker = 0;
    let lastSimSec = 0;

    const tick = (now: number) => {
      const deltaSec = Math.min(0.25, (now - lastTime) / 1000.0); // clamp tab-resume spikes
      lastTime = now;

      engine.update(deltaSec);
      const impact = engine.consumeImpactStrength();
      if (impact > 0.08) sceneMgr.impulse(impact * 0.6);
      sceneMgr.syncBodies(engine.bodies);
      sceneMgr.syncBelts(engine.belts ?? [], engine.bodies, Math.max(0, engine.timeSec - lastSimSec));
      lastSimSec = engine.timeSec;
      sceneMgr.syncDebris(engine.debris);
      sceneMgr.syncTrails(engine.bodies, engine.timeSec);
      sceneMgr.syncLabels(engine.bodies);
      sceneMgr.syncHabitableZones(engine.bodies);
      sceneMgr.syncXRay(
        engine.bodies.find(b => b.id === selectedBodyIdRef.current) || null,
        engine.bodies
      );
      sceneMgr.update(deltaSec);
      sceneMgr.render();

      frameTicker++;
      if (frameTicker % 10 === 0) {
        setSimTimeSec(engine.timeSec);
        setEventCount(engine.events.length);
        setSystemStatus(engine.systemStatus);
        setFrameCount(f => f + 1);

        if (showFutureRef.current && futureClientRef.current && !engine.isPaused) {
          futureClientRef.current.requestForecast(engine.bodies, {
            ...forecastOpts(sceneMgr.selectedBodyId, showSensitivityRef.current),
          });
        }

        // Sonification at ~6 Hz
        if (frameTicker % 20 === 0) {
          audibleOrrery.sync(engine.bodies, engine.timeScale);
        }

        // Rolling stability checkpoint every ~15 s (no recent catastrophe queue)
        if (frameTicker % 900 === 0 && engine.systemStatus === 'active') {
          autoCheckpointRef.current = engine.createSnapshot();
        }

        // Autosave ~5 s — suppressed while tab hidden
        if (frameTicker % 300 === 0 && !hiddenRef.current && branchManagerRef.current && engineRef.current && sceneRef.current) {
          branchManagerRef.current.checkpointActiveBranch(engineRef.current);
          const autoSaveProject = createSerializableProject(
            projectNameRef.current,
            branchManagerRef.current,
            engineRef.current,
            {
              scaleMode: scaleModeRef.current,
              showFuture: showFutureRef.current,
              showSensitivity: showSensitivityRef.current,
              showGravityGrid: sceneRef.current.gravityGrid.getMesh().visible,
              showXRay: prefsRef.current.showXRay,
              showLabels: prefsRef.current.showLabels,
              showTrails: prefsRef.current.showTrails,
              showHabitableZone: prefsRef.current.showHabitableZone,
            },
            sceneRef.current.captureCamera(),
            'system-autosave'
          );
          saveProjectToDb(autoSaveProject)
            .then(() => setLastSaveTime(new Date().toLocaleTimeString()))
            .catch(() => {});
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (canvasRef.current) {
        sceneMgr.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    // GPU context-loss containment: show a recovery toast instead of a frozen void
    const canvas = canvasRef.current;
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      pushToast('GPU context lost — reinitializing…', 'warn');
      window.setTimeout(() => window.location.reload(), 900);
    };
    canvas?.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      pointerMgr.destroy();
      futureClient.destroy();
      sceneMgr.dispose();
    };
  }, []);

  // === CONTROLS ===
  const handleTogglePause = () => {
    if (engineRef.current) {
      engineRef.current.isPaused = !engineRef.current.isPaused;
      setIsPaused(engineRef.current.isPaused);
      isPausedRef.current = engineRef.current.isPaused;
      audioSynth.playTick();
    }
  };

  const handleSetTimeScale = (scale: number) => {
    if (engineRef.current) {
      engineRef.current.timeScale = scale;
      setTimeScale(scale);
      timeScaleRef.current = scale;
    }
  };

  const handleToggleScaleMode = () => {
    if (sceneRef.current) {
      const next = scaleMode === 'readable' ? 'true' : 'readable';
      sceneRef.current.scaleTransform.setMode(next);
      setScaleMode(next);
      scaleModeRef.current = next;
      audioSynth.playTick();
      pushToast(next === 'readable' ? 'Readable scale: bodies magnified' : 'True scale: physical proportions', 'info');
    }
  };

  const handleToggleCollisions = () => {
    if (engineRef.current) {
      engineRef.current.enableCollisions = !collisionsEnabled;
      setCollisionsEnabled(engineRef.current.enableCollisions);
      collisionsEnabledRef.current = engineRef.current.enableCollisions;
      audioSynth.playTick();
    }
  };

  const handleToggleGravityGrid = () => {
    if (sceneRef.current) {
      const next = !gravityGridVisible;
      sceneRef.current.gravityGrid.getMesh().visible = next;
      setGravityGridVisible(next);
      audioSynth.playTick();
    }
  };

  const refreshSaves = () => {
    listAllProjects()
      .then(rows => setSaves(rows.filter(r => r.projectId !== 'system-autosave')))
      .catch(() => setSaves([]));
  };

  // Focus + select from a sub-window chip
  const handleFocus = (id: string) => {
    const body = engineRef.current?.bodies.find(b => b.id === id);
    if (body && sceneRef.current) {
      setSelectedBodyId(id);
      selectedBodyIdRef.current = id;
      sceneRef.current.setSelectedBody(id);
      sceneRef.current.focusBody(body, true);
    }
  };

  // === BRANCHING ===
  const handleForkBranch = () => setBranchPromptOpen(true);

  const doForkBranch = (name: string) => {
    if (branchManagerRef.current && engineRef.current && sceneRef.current) {
      const newBranch = branchManagerRef.current.forkBranch(name, engineRef.current);
      setBranches(branchManagerRef.current.getAllBranches());
      setActiveBranchId(newBranch.id);
      sceneRef.current.purgeDynamicOverlays();
      undoStackRef.current = [];
      setCanUndo(false);
      audioSynth.playTick();
      pushToast(`Causal branch "${name}" forked`, 'ok');
    }
    setBranchPromptOpen(false);
  };

  const handleSwitchBranch = (id: string) => {
    if (branchManagerRef.current && engineRef.current && sceneRef.current) {
      branchManagerRef.current.switchBranch(id, engineRef.current);
      setActiveBranchId(id);
      setSystemStatus(engineRef.current.systemStatus);
      sceneRef.current.syncBodies(engineRef.current.bodies);
      sceneRef.current.purgeDynamicOverlays();
      setSelectedBodyId(null);
      selectedBodyIdRef.current = null;
      sceneRef.current.setSelectedBody(null);
      undoStackRef.current = [];
      setCanUndo(false);
      audioSynth.playTick();
    }
  };

  // === PRESETS ===
  const handleLoadPreset = (presetType: 'demo' | 'meridian' | 'blank') => {
    if (!engineRef.current || !sceneRef.current) return;
    pushUndo(`Before preset: ${presetType}`);

    let preset: { bodies: CelestialBody[]; belts?: any[] };
    let pName = '';
    if (presetType === 'demo') { preset = createDemonstrationSystem(); pName = 'Kallisto Demonstration System'; }
    else if (presetType === 'meridian') { preset = createMeridianPreset(); pName = 'Virgil & Meridian Reference Study'; }
    else { preset = createBlankSystem(); pName = 'Blank System'; }

    engineRef.current.bodies = preset.bodies;
    engineRef.current.belts = preset.belts || [];
    engineRef.current.timeSec = 0;
    engineRef.current.systemStatus = 'active';
    engineRef.current.events = [];
    setSystemStatus('active');

    const bMgr = new BranchManager(engineRef.current, 'Prime Timeline');
    branchManagerRef.current = bMgr;
    setBranches(bMgr.getAllBranches());
    setActiveBranchId(bMgr.activeBranchId);

    sceneRef.current.syncBodies(engineRef.current.bodies);
    sceneRef.current.purgeDynamicOverlays();
    sceneRef.current.resetCamera(engineRef.current.bodies);
    setSelectedBodyId(null);
    selectedBodyIdRef.current = null;
    sceneRef.current.setSelectedBody(null);

    setProjectName(pName);
    projectNameRef.current = pName;
    setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
    audioSynth.playPresetShimmer();
    pushToast(`Preset loaded: ${pName}`, 'ok');
  };

  // === CANON ===
  const handleExecuteMacro = (macro: CanonMacro, targetId?: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    pushUndo(`Before macro: ${macro.label ?? macro.id}`);
    const ev = macro.apply(engineRef.current, targetId);
    if (ev) {
      if (macro.id === 'pull-starsilk' || macro.id === 'starbinding-study') audioSynth.playStarCollapse();
      else audioSynth.playTick();
      setSystemStatus(engineRef.current.systemStatus);
      branchManagerRef.current?.checkpointActiveBranch(engineRef.current);
      sceneRef.current.syncBodies(engineRef.current.bodies);
      sceneRef.current.purgeDynamicOverlays();
      setEventCount(engineRef.current.events.length);
      setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engineRef.current.bodies));
      setIsCanonLabOpen(false);
      pushToast(`Canon macro executed: ${ev.title}`, 'warn');
    }
  };

  const handleSpawnTemplate = (tmpl: any) => {
    if (!engineRef.current || !sceneRef.current) return;
    const star = engineRef.current.bodies.find(b => b.type === 'star');
    const distKm = 1.4 * 149597870.7;
    const newWorld: CelestialBody = {
      id: `tmpl-${tmpl.id}-${Date.now()}`,
      name: tmpl.name,
      type: 'planet',
      massKg: 5.97e24,
      radiusKm: 6400,
      position: { x: distKm, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: star ? Math.sqrt((6.6743e-20 * star.massKg) / distKm) : 25 },
      color: '#38bdf8',
      unauthored_in_source: true,
      sourceCanonStatus: 'unknown',
      plannerClassification: 'CANON-INSPIRED SANDBOX',
      sourceCitation: 'WorldsVault Extinct Planetary Template Registry',
      stableId: 'worldsvault-templates',
    };
    engineRef.current.addBody(newWorld);
    sceneRef.current.syncBodies(engineRef.current.bodies);
    setSelectedBodyId(newWorld.id);
    selectedBodyIdRef.current = newWorld.id;
    sceneRef.current.setSelectedBody(newWorld.id);
    audioSynth.playTick();
  };

  // === EXPORT / IMPORT / SAVES ===
  const handleExport = () => {
    if (!engineRef.current || !branchManagerRef.current || !sceneRef.current) return;
    const project = createSerializableProject(
      projectNameRef.current,
      branchManagerRef.current,
      engineRef.current,
      {
        scaleMode: scaleModeRef.current,
        showFuture: showFutureRef.current,
        showSensitivity: showSensitivityRef.current,
        showGravityGrid: gravityGridVisible,
        showXRay: prefsRef.current.showXRay,
        showLabels: prefsRef.current.showLabels,
        showTrails: prefsRef.current.showTrails,
        showHabitableZone: prefsRef.current.showHabitableZone,
      },
      sceneRef.current.captureCamera(),
      `proj-${Date.now()}`
    );
    downloadProjectFile(project);
    audioSynth.playTick();
    pushToast('System exported as .ssp.json', 'ok');
  };

  const applyProject = (project: ReturnType<typeof createSerializableProject>) => {
    if (!engineRef.current || !sceneRef.current) return;
    pushUndo('Before import/load');
    const activeBranch = project.branches.find(b => b.id === project.activeBranchId) || project.branches[0];
    engineRef.current.restoreSnapshot(activeBranch.snapshot);
    engineRef.current.events = [...activeBranch.events];
    engineRef.current.systemStatus = project.systemStatus || activeBranch.snapshot.systemStatus || 'active';
    setSystemStatus(engineRef.current.systemStatus);

    const bMgr = BranchManager.fromPersisted(project.branches, project.activeBranchId);
    branchManagerRef.current = bMgr;
    setBranches(bMgr.getAllBranches());
    setActiveBranchId(bMgr.activeBranchId);

    setProjectName(project.projectName);
    projectNameRef.current = project.projectName;
    sceneRef.current.syncBodies(engineRef.current.bodies);
    sceneRef.current.purgeDynamicOverlays();
    if (project.cameraState) sceneRef.current.restoreCamera(project.cameraState);
    setSigilSvg(generateSystemSigilSvg(project.projectName, engineRef.current.bodies));
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re2) => {
        try {
          const raw = re2.target?.result as string;
          const project = parseAndValidateProjectJson(raw);
          applyProject(project);
          audioSynth.playTick();
          pushToast(`Imported: ${project.projectName}`, 'ok');
        } catch (err: any) {
          pushToast(`Import failed: ${err.message}`, 'warn');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleSaveAs = async () => {
    if (!engineRef.current || !branchManagerRef.current || !sceneRef.current) return;
    const project = createSerializableProject(
      projectNameRef.current,
      branchManagerRef.current,
      engineRef.current,
      {
        scaleMode: scaleModeRef.current,
        showFuture: showFutureRef.current,
        showSensitivity: showSensitivityRef.current,
        showGravityGrid: gravityGridVisible,
      },
      sceneRef.current.captureCamera(),
      `proj-${Date.now()}`
    );
    await saveProjectToDb(project);
    setLastSaveTime(new Date().toLocaleTimeString());
    pushToast(`Project saved: ${project.projectName}`, 'ok');
    audioSynth.playTick();
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === 'save') {
      await deleteProjectFromDb(deleteConfirm.id);
      setDeleteConfirm(null);
      refreshSaves();
      pushToast('Saved project deleted', 'info');
      return;
    }
    pushUndo(`Before delete: ${deleteConfirm.name}`);
    engineRef.current?.removeBody(deleteConfirm.id);
    if (sceneRef.current && engineRef.current) {
      sceneRef.current.syncBodies(engineRef.current.bodies);
      sceneRef.current.purgeDynamicOverlays();
      sceneRef.current.trajectoryRenderer.pruneToAlive(new Set(engineRef.current.bodies.map(b => b.id)));
      sceneRef.current.syncXRay(null, engineRef.current.bodies);
    }
    setSelectedBodyId(null);
    selectedBodyIdRef.current = null;
    sceneRef.current?.setSelectedBody(null);
    audioSynth.playStarCollapse();
    pushToast(`${deleteConfirm.name} removed from continuity`, 'warn');
    setDeleteConfirm(null);
  };

  const handleRename = (name: string) => {
    setProjectName(name);
    projectNameRef.current = name;
    setSigilSvg(generateSystemSigilSvg(name, engineRef.current?.bodies || []));
    setRenamePromptOpen(false);
  };

  const selectedBody = engineRef.current?.bodies.find(b => b.id === selectedBodyId) || null;

  const lensBar = (
    <LensBar
      showLabels={prefs.showLabels}
      showTrails={prefs.showTrails}
      showHabitableZone={prefs.showHabitableZone}
      showXRay={prefs.showXRay}
      onToggle={(key) => updatePrefs({ [key]: !prefsRef.current[key] } as Partial<UserPrefs>)}
      onOpenPostcard={() => setIsPostcardOpen(true)}
      onOpenHelp={() => setIsHelpOpen(true)}
    />
  );

  return (
    <RendererBoundary>
      <div className={`planner-viewport app-shell ${bootReady ? '' : 'booting'}`}>
        <canvas ref={canvasRef} className="universe-canvas" />

        {/* Cinematic boot veil */}
        {!bootReady && (
          <div className="boot-screen">
            <div className="boot-card">
              <div className="brand-title">STARSILK SYSTEM PLANNER</div>
              <div className="brand-subtitle" style={{ marginTop: 8 }}>BINDING SIMULATION KERNEL…</div>
            </div>
          </div>
        )}

        <div className="hud-layer">
          <TopBar
            projectName={projectName}
            sigilSvg={sigilSvg}
            systemStatus={systemStatus}
            mode={mode}
            onSetMode={(m) => {
              setMode(m);
              if (m === 'CANON LAB') setIsCanonLabOpen(true);
            }}
            scaleMode={scaleMode}
            onToggleScaleMode={handleToggleScaleMode}
            collisionsEnabled={collisionsEnabled}
            onToggleCollisions={handleToggleCollisions}
            audioEnabled={prefs.audioEnabled}
            onToggleAudio={() => updatePrefs({ audioEnabled: !prefs.audioEnabled })}
            gravityGridVisible={gravityGridVisible}
            onToggleGravityGrid={handleToggleGravityGrid}
            onExport={handleExport}
            onImport={handleImport}
            onLoadPreset={handleLoadPreset}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenSaves={() => { refreshSaves(); setIsSavesOpen(true); }}
            onRename={() => setRenamePromptOpen(true)}
            lastSaveTime={lastSaveTime}
          />

          <div style={{ flex: 1, pointerEvents: 'none' }} />

          {selectedBody && (
            <ContextInspector
              selectedBody={selectedBody}
              allBodies={engineRef.current?.bodies || []}
              onUpdateBody={(updated) => {
                if (engineRef.current && sceneRef.current) {
                  pushUndo(`Before edit: ${updated.name}`);
                  const idx = engineRef.current.bodies.findIndex(b => b.id === updated.id);
                  if (idx !== -1) {
                    engineRef.current.bodies[idx] = updated;
                    sceneRef.current.syncBodies(engineRef.current.bodies);
                    setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engineRef.current.bodies));
                    setFrameCount(f => f + 1);
                  }
                }
              }}
              onDeleteBody={(id) => {
                const victim = engineRef.current?.bodies.find(b => b.id === id);
                if (victim) setDeleteConfirm({ id, name: victim.name, kind: 'body' });
              }}
              onFocusBody={(_id) => handleFocus(_id)}
              onStartGrabThrow={(body) => {
                setActiveTool('grab_throw');
                grabThrowRef.current?.startGrab(body);
              }}
              onOpenCanonMacro={(_macroId) => setIsCanonLabOpen(true)}
              onOpenBodyPicker={() => setIsBodyPickerOpen(true)}
            />
          )}

          <TimelineBar
            timeSec={simTimeSec}
            timeScale={timeScale}
            isPaused={isPaused}
            onTogglePause={handleTogglePause}
            onSetTimeScale={handleSetTimeScale}
            branches={branches}
            activeBranchId={activeBranchId}
            onSwitchBranch={handleSwitchBranch}
            onForkBranch={handleForkBranch}
            onOpenLedger={() => setIsLedgerOpen(true)}
            onOpenBranchCompare={() => setIsCompareOpen(true)}
            eventCount={eventCount}
            bodyCount={engineRef.current?.bodies.length ?? 0}
            restoredFromSave={restoredFromSave}
          />
        </div>

        <ToolRail
          activeTool={activeTool}
          onSelectTool={(t) => { setActiveTool(t); audioSynth.playTick(); }}
          showFuture={showFuture}
          onToggleShowFuture={() => setShowFuture(!showFuture)}
          showSensitivity={showSensitivity}
          onToggleShowSensitivity={() => setShowSensitivity(!showSensitivity)}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
          onOpenCanonLab={() => setIsCanonLabOpen(true)}
          onResetCamera={() => sceneRef.current?.resetCamera(engineRef.current?.bodies)}
          onUndo={canUndo ? handleUndo : undefined}
          canUndo={canUndo}
        />

        {lensBar}

        {aimReadout && <AimChip readout={aimReadout} />}

        <Toasts toasts={toasts} />

        {/* First-run coach tour */}
        {bootReady && !prefs.seenOnboarding && (
          <QuickTour onDone={() => {
            updatePrefs({ seenOnboarding: true });
            pushToast('Tour archived — re-open anytime with ?', 'info');
          }} />
        )}

        {/* Orbit Loom Conic Confirmation */}
        {pendingOrbit && (
          <OrbitLoomConfirmModal
            fittedOrbit={pendingOrbit}
            primaryBody={orbitLoomRef.current?.getPrimary() || null}
            selectedBody={selectedBody}
            allBodies={engineRef.current?.bodies || []}
            onScrubPeriapsis={(km) => orbitLoomRef.current?.setPeriapsis(km)}
            onScrubApoapsis={(km) => orbitLoomRef.current?.setApoapsis(km)}
            onScrubInclination={(deg) => orbitLoomRef.current?.setInclination(deg)}
            onApplyToBody={(targetBody) => {
              if (orbitLoomRef.current && engineRef.current && sceneRef.current) {
                const prim = orbitLoomRef.current.getPrimary();
                const success = orbitLoomRef.current.applyToBody(targetBody);
                if (success && prim) {
                  sceneRef.current.syncBodies(engineRef.current.bodies);
                  audioSynth.playOrbitLock();
                  engineRef.current.events.push({
                    id: `loom-${Date.now()}`,
                    timestampSec: engineRef.current.timeSec,
                    type: 'body_created',
                    title: `Orbit Fitted: ${targetBody.name}`,
                    description: `${targetBody.name} assigned to fitted Keplerian orbit around ${prim.name} (a=${(pendingOrbit.semiMajorAxisKm / 149597870.7).toFixed(3)} AU, e=${pendingOrbit.eccentricity.toFixed(3)}, i=${pendingOrbit.inclinationDeg.toFixed(1)}°).`,
                    bodyIds: [targetBody.id, prim.id],
                    severity: 'info',
                  });
                  setEventCount(engineRef.current.events.length);
                  if (showFutureRef.current && futureClientRef.current) {
                    futureClientRef.current.requestForecast(engineRef.current.bodies, {
                      ...forecastOpts(targetBody.id, showSensitivityRef.current),
                    }, true);
                  }
                }
              }
              setPendingOrbit(null);
            }}
            onCreateRing={() => {
              if (orbitLoomRef.current && engineRef.current && sceneRef.current) {
                const prim = orbitLoomRef.current.getPrimary();
                const ring = orbitLoomRef.current.commitToRing();
                if (ring && prim) {
                  if (!prim.rings) prim.rings = [];
                  prim.rings.push(ring);
                  sceneRef.current.syncBodies(engineRef.current.bodies);
                  audioSynth.playOrbitLock();
                }
              }
              setPendingOrbit(null);
            }}
            onCreateBelt={(beltName, count) => {
              if (orbitLoomRef.current && engineRef.current && sceneRef.current) {
                const belt = orbitLoomRef.current.commitToBelt(beltName, count);
                if (belt) {
                  engineRef.current.belts = [...(engineRef.current.belts || []), belt];
                  sceneRef.current.syncBodies(engineRef.current.bodies);
                  sceneRef.current.syncBelts(engineRef.current.belts, engineRef.current.bodies, 0);
                  audioSynth.playOrbitLock();
                  engineRef.current.events.push({
                    id: `belt-${Date.now()}`,
                    timestampSec: engineRef.current.timeSec,
                    type: 'body_created',
                    title: `Debris Belt Established: ${belt.name}`,
                    description: `${belt.particleCount} particles injected on Loomed Keplerian paths (${(belt.innerRadiusKm / 1e6).toFixed(1)}M–${(belt.outerRadiusKm / 1e6).toFixed(1)}M km).`,
                    bodyIds: [belt.primaryId],
                    severity: 'info',
                  });
                  setEventCount(engineRef.current.events.length);
                }
              }
              setPendingOrbit(null);
            }}
            onCancel={() => {
              orbitLoomRef.current?.clear();
              setPendingOrbit(null);
            }}
          />
        )}

        {isCreateModalOpen && (
          <CreateBodyModal
            existingBodies={engineRef.current?.bodies || []}
            onSpawnBody={(newBody) => {
              if (engineRef.current) {
                engineRef.current.addBody(newBody);
                sceneRef.current?.syncBodies(engineRef.current.bodies);
                setSelectedBodyId(newBody.id);
                selectedBodyIdRef.current = newBody.id;
                sceneRef.current?.setSelectedBody(newBody.id);
                const body = engineRef.current.bodies.find(b => b.id === newBody.id);
                if (body && sceneRef.current) sceneRef.current.focusBody(body, false);
              }
            }}
            onOrbitRadiusPreview={(radius, primary) => {
              if (sceneRef.current && primary && radius > 0) sceneRef.current.showOrbitGhost(primary, radius);
              else sceneRef.current?.hideOrbitGhost();
            }}
            onClose={() => { sceneRef.current?.hideOrbitGhost(); setIsCreateModalOpen(false); }}
          />
        )}

        {isCanonLabOpen && (
          <CanonLabModal
            selectedBody={selectedBody}
            allBodies={engineRef.current?.bodies || []}
            onExecuteMacro={handleExecuteMacro}
            onSpawnTemplateWorld={handleSpawnTemplate}
            onClose={() => setIsCanonLabOpen(false)}
          />
        )}

        {isLedgerOpen && (
          <EventLedgerModal
            events={engineRef.current?.events || []}
            simTimeSec={simTimeSec}
            onClose={() => setIsLedgerOpen(false)}
          />
        )}

        {isCompareOpen && branchManagerRef.current && (
          <BranchCompareModal
            branches={branches}
            branchManager={branchManagerRef.current}
            onClose={() => setIsCompareOpen(false)}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            prefs={prefs}
            onUpdate={updatePrefs}
            sensitivityOn={showSensitivity}
            showFuture={showFuture}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {isSavesOpen && (
          <SavesModal
            saves={saves}
            onLoad={async (projectId) => {
              const project = await loadProjectFromDb(projectId);
              if (project) {
                applyProject(project);
                pushToast(`Loaded: ${project.projectName}`, 'ok');
              }
              setIsSavesOpen(false);
            }}
            onDelete={(projectId, name) => setDeleteConfirm({ id: projectId, name, kind: 'save' })}
            onSaveAs={handleSaveAs}
            onRefresh={refreshSaves}
            onClose={() => setIsSavesOpen(false)}
          />
        )}

        {isBodyPickerOpen && (
          <BodyPickerModal
            bodies={engineRef.current?.bodies || []}
            selectedId={selectedBodyId}
            onPick={(id) => { handleFocus(id); setIsBodyPickerOpen(false); }}
            onClose={() => setIsBodyPickerOpen(false)}
          />
        )}

        {isHelpOpen && <HelpOverlay onClose={() => setIsHelpOpen(false)} />}

        {isPostcardOpen && (
          <PostcardModal
            canvas={canvasRef.current}
            sigilSvg={sigilSvg}
            projectName={projectName}
            simTimeSec={simTimeSec}
            onDone={() => setIsPostcardOpen(false)}
            onClose={() => setIsPostcardOpen(false)}
          />
        )}

        {branchPromptOpen && (
          <NamePromptModal
            title="FORK CAUSAL BRANCH"
            label="Branch designation"
            defaultValue={`Branch @ ${Math.round(engineRef.current?.timeSec ?? 0)}s`}
            placeholder="e.g. Variant K7 — Dark Virgil"
            onConfirm={doForkBranch}
            onCancel={() => setBranchPromptOpen(false)}
          />
        )}

        {renamePromptOpen && (
          <NamePromptModal
            title="RENAME SYSTEM"
            label="System designation"
            defaultValue={projectName}
            onConfirm={handleRename}
            onCancel={() => setRenamePromptOpen(false)}
          />
        )}

        {deleteConfirm && (
          <ModalShell title="CONFIRM DELETION" onClose={() => setDeleteConfirm(null)} width={380}>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.7 }}>
              Permanently remove <strong style={{ color: '#ff5e6c' }}>{deleteConfirm.name}</strong>?
              {deleteConfirm.kind === 'body'
                ? 'Ctrl+Z afterwards recalls it via the undo bank.'
                : 'This erases the saved snapshot from the local vault.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="ui-button" onClick={() => setDeleteConfirm(null)}>Stand Down</button>
              <button className="ui-button danger" onClick={() => { void executeDelete(); }}>Execute</button>
            </div>
          </ModalShell>
        )}
      </div>
    </RendererBoundary>
  );
};

export default App;
