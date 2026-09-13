import React, { useEffect, useRef, useState } from 'react';
import { SceneManager } from './rendering/scene-manager';
import { SimulationEngine } from './simulation/engine';
import { PointerManager, PointerToolMode } from './interaction/pointer-manager';
import { GrabAndThrowController } from './interaction/grab-and-throw';
import { OrbitLoom, FittedOrbit } from './interaction/orbit-loom';
import { FutureClient } from './simulation/future-client';
import { BranchManager } from './branching/branch-manager';
import { CelestialBody, SystemStatus } from './simulation/types';
import { ScaleMode } from './rendering/scale-transform';
import { createDemonstrationSystem } from './simulation/presets/demo-system';
import { createMeridianPreset } from './simulation/presets/meridian-preset';
import { createBlankSystem } from './simulation/presets/blank-system';
import { createProceduralSystem } from './simulation/presets/procedural-system';
import { generateSystemSigilSvg } from './persistence/sigil';
import { loadProjectFromDb } from './persistence/db';
import { downloadProjectFile, parseProjectWithMigration } from './persistence/export-import';
import { createSerializableProject } from './persistence/serializer';
import { AutosaveManager, AutosaveStatus } from './persistence/autosave';
import { audioSynth } from './audio/audio-synth';
import { CanonMacro } from './canon/macros';
import { resolvePointerIntent } from './interaction/pointer-intent';
import { SimulationEventMonitor } from './simulation/event-monitor';
import { UndoStack } from './simulation/undo-stack';
import { applyNudge, circularizeOrbit, matchVelocity, NudgeDirection } from './simulation/maneuvers';
import { ForecastAlert, ForecastAlertTracker } from './simulation/forecast-alerts';
import { ChallengeState, ChallengeTracker, CHALLENGE_DEFINITIONS } from './simulation/challenges';
import { eventBus } from './core/event-bus';
import { logger } from './core/logger';
import { PerfMonitor } from './core/perf-monitor';
import { CapabilityReport, detectCapabilities } from './core/capabilities';
import { PLANNER_CONFIG } from './core/config';
import { PlannerSettings, settingsStore } from './core/settings';
import { formatCountdown } from './simulation/units';
import { isEditableTarget, shortcutIdForEvent } from './ui/shortcuts';

// UI Components
import { TopBar, AppMode, PresetKind } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { ContextInspector } from './ui/ContextInspector';
import { TimelineBar } from './ui/TimelineBar';
import { CanonLabModal } from './ui/CanonLabModal';
import { CreateBodyModal } from './ui/CreateBodyModal';
import { EventLedgerModal } from './ui/EventLedgerModal';
import { BranchCompareModal } from './ui/BranchCompareModal';
import { OrbitLoomConfirmModal } from './ui/OrbitLoomConfirmModal';
import { ToastProvider, useToast, pushToastGlobal } from './ui/toast';
import { BootSplash } from './ui/BootSplash';
import { OnboardingOverlay } from './ui/OnboardingOverlay';
import { ForkBranchModal } from './ui/ForkBranchModal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SystemNavigator } from './ui/SystemNavigator';
import { SelectionChip } from './ui/SelectionChip';
import { SettingsModal } from './ui/SettingsModal';
import { SystemStatsModal } from './ui/SystemStatsModal';
import { MissionsPanel } from './ui/MissionsPanel';
import { ShortcutsModal } from './ui/ShortcutsModal';

const TIME_LADDER = [1, 10, 100, 1000, 10000, 100000];

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

const PlannerApp: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toast = useToast();

  // Engine and core references
  const engineRef = useRef<SimulationEngine | null>(null);
  const sceneRef = useRef<SceneManager | null>(null);
  const branchManagerRef = useRef<BranchManager | null>(null);
  const grabThrowRef = useRef<GrabAndThrowController | null>(null);
  const orbitLoomRef = useRef<OrbitLoom | null>(null);
  const futureClientRef = useRef<FutureClient | null>(null);
  const pointerManagerRef = useRef<PointerManager | null>(null);
  const undoStackRef = useRef<UndoStack | null>(null);
  const monitorRef = useRef<SimulationEventMonitor | null>(null);
  const alertTrackerRef = useRef<ForecastAlertTracker | null>(null);
  const challengeTrackerRef = useRef<ChallengeTracker | null>(null);
  const autosaveRef = useRef<AutosaveManager | null>(null);
  const perfRef = useRef<PerfMonitor | null>(null);

  // Boot / capability state
  const [booted, setBooted] = useState(false);
  const [bootStage, setBootStage] = useState('Probing device capabilities…');
  const [bootProgress, setBootProgress] = useState(0.05);
  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // UI State
  const [settings, setSettings] = useState<PlannerSettings>(() => settingsStore.get());
  const [projectName, setProjectName] = useState('Kallisto Demonstration System');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('active');
  const [mode, setMode] = useState<AppMode>('SIMULATE');
  const [activeTool, setActiveTool] = useState<PointerToolMode>('select');
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('readable');
  const [collisionsEnabled, setCollisionsEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(() => settingsStore.get().audioEnabled);
  const [gravityGridVisible, setGravityGridVisible] = useState(false);
  const [hzVisible, setHzVisible] = useState(false);
  const [showFuture, setShowFuture] = useState(true);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [sigilSvg, setSigilSvg] = useState('');
  const [followEnabled, setFollowEnabled] = useState(false);
  const [topDownEnabled, setTopDownEnabled] = useState(false);
  const [forecastAlerts, setForecastAlerts] = useState<ForecastAlert[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [challenges, setChallenges] = useState<ChallengeState[]>([]);
  const [fps, setFps] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveAtMs, setAutosaveAtMs] = useState<number | null>(null);
  const [navigatorVisible, setNavigatorVisible] = useState(() => settingsStore.get().navigatorVisible);
  const [missionsVisible, setMissionsVisible] = useState(false);

  // Orbit Loom pending fitted orbit
  const [pendingOrbit, setPendingOrbit] = useState<FittedOrbit | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCanonLabOpen, setIsCanonLabOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isForkOpen, setIsForkOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Timeline Branches
  const [branches, setBranches] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('branch-prime');

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
  const settingsRef = useRef<PlannerSettings>(settings);
  settingsRef.current = settings;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  // Cleanup tool actions on tool switch
  useEffect(() => {
    if (activeTool !== 'orbit_loom') {
      orbitLoomRef.current?.clear();
      setPendingOrbit(null);
    }
    if (activeTool !== 'grab_throw') {
      grabThrowRef.current?.cancelGrab();
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
        selectedBodyId: selectedBodyIdRef.current,
        calculateSensitivity: showSensitivity,
      });
    }
    if (!showFuture && sceneRef.current) {
      sceneRef.current.trajectoryRenderer.clearAll();
    }
  }, [showFuture, showSensitivity]);

  // Apply settings side effects (audio, autosave, reduced motion).
  useEffect(() => {
    audioSynth.setVolume(settings.audioVolume);
    audioSynth.isEnabled = settings.audioEnabled;
    setAudioEnabled(settings.audioEnabled);
    autosaveRef.current?.setEnabled(settings.autosaveEnabled && capabilities?.indexedDb !== false);
    if (sceneRef.current) {
      sceneRef.current.reducedMotion = settings.reducedMotion;
    }
  }, [settings, capabilities]);

  // Selection side effects: follow-on-select + first-light challenge.
  const handleSelectBody = (id: string | null): void => {
    setSelectedBodyId(id);
    selectedBodyIdRef.current = id;
    sceneRef.current?.setSelectedBody(id);
    if (id) {
      challengeTrackerRef.current?.credit('first-light');
      audioSynth.playSelect();
      if (settingsRef.current.followOnSelect && sceneRef.current) {
        sceneRef.current.viewMode = 'follow_selected';
        setFollowEnabled(true);
        setTopDownEnabled(false);
      }
    }
  };

  // Initialize System
  useEffect(() => {
    if (!canvasRef.current) return;

    const caps = detectCapabilities();
    setCapabilities(caps);
    logger.info('boot', `Capabilities: ${caps.summary}`, caps);
    if (caps.summary === 'blocked') {
      setBootStage('Startup blocked — see diagnostics');
      return;
    }
    setBootProgress(0.2);
    setBootStage('Igniting WebGL viewport…');

    // 1. Initialize SceneManager
    const sceneMgr = new SceneManager(canvasRef.current);
    sceneMgr.reducedMotion = settingsStore.get().reducedMotion;
    sceneRef.current = sceneMgr;
    setBootProgress(0.35);
    setBootStage('Integrating demonstration system…');

    // 2. Initialize SimulationEngine with built-in Demo System
    const initialPreset = createDemonstrationSystem();
    const engine = new SimulationEngine(initialPreset.bodies, { enableCollisions: true });
    engine.belts = initialPreset.belts;
    engineRef.current = engine;

    // 3. Initialize BranchManager
    const branchMgr = new BranchManager(engine, 'Prime Timeline');
    branchManagerRef.current = branchMgr;
    setBranches(branchMgr.getAllBranches());
    setActiveBranchId(branchMgr.activeBranchId);

    // 3b. Iteration-1 managers: undo, monitor, alerts, challenges, autosave, perf.
    const undoStack = new UndoStack();
    undoStack.subscribe((depth) => setUndoDepth(depth));
    undoStackRef.current = undoStack;
    monitorRef.current = new SimulationEventMonitor();
    alertTrackerRef.current = new ForecastAlertTracker();
    const challenges = new ChallengeTracker();
    challenges.setBodyProvider(() => engineRef.current?.bodies ?? []);
    challenges.subscribe((states) => setChallenges(states));
    challengeTrackerRef.current = challenges;
    const autosave = new AutosaveManager();
    autosave.setEnabled(settingsStore.get().autosaveEnabled && caps.indexedDb);
    autosave.subscribe((state) => {
      setAutosaveStatus(state.status);
      setAutosaveAtMs(state.lastSavedAtMs);
    });
    autosaveRef.current = autosave;
    const perf = new PerfMonitor();
    let fpsUpdates = 0;
    perf.onSample((sample) => {
      fpsUpdates++;
      if (fpsUpdates % 30 === 0) setFps(sample.fps);
    });
    perfRef.current = perf;

    // Cross-system bus wiring.
    const unsubs = [
      eventBus.on('collision:occurred', (e) => {
        const payload = e.payload as { bodyIds?: string[] };
        const targetId = payload.bodyIds?.[0];
        if (targetId) sceneMgr.spawnCollisionBurstAtBody(targetId, '#ffb35c', 1.2);
        audioSynth.playCollisionThump();
      }),
      eventBus.on('challenge:completed', (e) => {
        const payload = e.payload as { title?: string };
        audioSynth.playSuccess();
        pushToastGlobal({
          kind: 'success',
          title: `Mission complete: ${payload.title ?? 'Challenge'}`,
          detail: 'The architect’s legend grows.',
        });
      }),
      eventBus.on('quality:degraded', () => {
        sceneMgr.setPixelRatio(PLANNER_CONFIG.quality.minPixelRatio);
        sceneMgr.setStarfieldDensity(0.45);
        pushToastGlobal({
          kind: 'warning',
          title: 'Quality auto-scaled',
          detail: 'Sustained GPU pressure — pixel ratio reduced to protect frame rate.',
        });
      }),
      eventBus.on('quality:restored', () => {
        sceneMgr.setPixelRatio(Math.min(window.devicePixelRatio || 1, PLANNER_CONFIG.quality.maxPixelRatio));
        sceneMgr.setStarfieldDensity(1);
      }),
    ];

    setBootProgress(0.5);
    setBootStage('Calibrating tactile input…');

    // 4. Initialize Grab & Throw
    const grabThrow = new GrabAndThrowController(sceneMgr, {
      onVelocityChanged: (body, _vel) => {
        if (showFutureRef.current && futureClientRef.current) {
          futureClientRef.current.requestForecast(engine.bodies, {
            selectedBodyId: body.id,
            calculateSensitivity: showSensitivityRef.current,
          });
        }
      },
      onThrowReleased: (body, vel) => {
        audioSynth.playTick();
        engine.events.push({
          id: `throw-${Date.now()}`,
          timestampSec: engine.timeSec,
          type: 'throw_released',
          title: `Throw Released: ${body.name}`,
          description: `${body.name} launched with velocity (${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)}) km/s into physical space.`,
          bodyIds: [body.id],
          severity: 'info',
        });
        eventBus.emit('throw:released', { bodyId: body.id });
        setEventCount(engine.events.length);
        if (showFutureRef.current && futureClientRef.current) {
          futureClientRef.current.requestForecast(engine.bodies, {
            selectedBodyId: body.id,
            calculateSensitivity: showSensitivityRef.current,
          });
        }
      },
    });
    grabThrowRef.current = grabThrow;

    // 5. Initialize Orbit Loom
    const loom = new OrbitLoom(sceneMgr);
    const star = engine.bodies.find(b => b.type === 'star') || engine.bodies[0];
    if (star) loom.setPrimary(star);
    orbitLoomRef.current = loom;

    // 6. Initialize Future Client
    const futureClient = new FutureClient((response) => {
      const maxPoints = settingsRef.current.trajectoryPoints;
      for (const [bodyId, points] of Object.entries(response.trajectories)) {
        sceneMgr.trajectoryRenderer.updateBodyTrajectory({
          bodyId,
          points: points.slice(0, maxPoints),
          isSelected: bodyId === selectedBodyIdRef.current,
        });
      }
      if (response.sensitivityFans) {
        sceneMgr.trajectoryRenderer.updateSensitivityCloud(response.sensitivityFans);
      }
      // GAME04: forecast collision alerts → markers + ledger + HUD.
      const tracker = alertTrackerRef.current;
      if (tracker && engineRef.current) {
        const alerts = tracker.ingest(response, engineRef.current.bodies);
        setForecastAlerts(alerts);
        const sites = alerts
          .map((a) => response.collisions.find((c) => [c.bodyAId, c.bodyBId].sort().join('::') === a.key)?.positionKm)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        sceneMgr.trajectoryRenderer.setCollisionMarkers(sites);
        const fresh = tracker.unannounced();
        for (const alert of fresh) {
          tracker.markAnnounced(alert.key);
          engineRef.current.events.push({
            id: `forecast-${alert.key}-${Date.now()}`,
            timestampSec: engineRef.current.timeSec,
            type: 'forecast_warning',
            title: `Forecast: ${alert.bodyAName} → ${alert.bodyBName}`,
            description: `Predicted impact in ${formatCountdown(alert.timeToImpactSec)} (severity: ${alert.severity}). Alter a trajectory or fork the timeline to intervene.`,
            bodyIds: [alert.bodyAId, alert.bodyBId],
            severity: alert.severity === 'watch' ? 'info' : 'caution',
          });
          eventBus.emit('collision:forecast', { key: alert.key, severity: alert.severity });
          if (alert.severity === 'imminent') {
            audioSynth.playImpactSiren();
            toastRef.current.push({
              kind: 'error',
              title: `Imminent impact: ${alert.bodyAName} → ${alert.bodyBName}`,
              detail: `Collision forecast in ${formatCountdown(alert.timeToImpactSec)}.`,
              durationMs: 7000,
            });
          }
        }
        if (fresh.length > 0) setEventCount(engineRef.current.events.length);
      }
    });
    futureClientRef.current = futureClient;

    // 7. Initialize PointerManager
    const pointerMgr = new PointerManager(canvasRef.current, {
      onPointerDown: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        const currentTool = activeToolRef.current;
        const hitBodyId = sceneMgr.raycastBody(normX, normY);

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
            setSelectedBodyId(hitBodyId);
            selectedBodyIdRef.current = hitBodyId;
            sceneMgr.setSelectedBody(hitBodyId);
            const b = engine.bodies.find(b => b.id === hitBodyId);
            if (b) {
              pointerMgr.isManipulatingObject = true;
              grabThrow.startGrab(b);
            }
          }
          return;
        }

        if (intent === 'select_body') {
          if (hitBodyId) {
            handleSelectBody(hitBodyId);
          }
          return;
        }

        if (intent === 'deselect') {
          setSelectedBodyId(null);
          selectedBodyIdRef.current = null;
          sceneMgr.setSelectedBody(null);
          return;
        }
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
          sceneMgr.orbitCamera(-e.deltaX * 0.006, -e.deltaY * 0.006);
        } else if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
          // Hover highlight for precise targeting (ASSET07).
          sceneMgr.setHoverBody(sceneMgr.raycastBody(normX, normY));
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
        }
      },
      onPointerCancel: () => {
        pointerMgr.isDrawingOrbit = false;
        pointerMgr.isManipulatingObject = false;
        loom.clear();
        setPendingOrbit(null);
        grabThrow.cancelGrab();
      },
      onPinchZoom: (factor) => {
        sceneMgr.zoomCamera(factor);
      },
      onTwoFingerPan: (dx, dy) => {
        sceneMgr.panCamera(dx, dy);
      },
    });
    pointerManagerRef.current = pointerMgr;

    // Generate initial Sigil
    const initialSigil = generateSystemSigilSvg('Kallisto Demonstration System', engine.bodies);
    setSigilSvg(initialSigil);

    // Initial render
    sceneMgr.syncBodies(engine.bodies, engine.belts);

    setBootProgress(0.7);
    setBootStage('Restoring autosave…');

    // === STARTUP RESTORE FROM INDEXEDDB ===
    loadProjectFromDb(PLANNER_CONFIG.persistence.autosaveSlotId)
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
            setSystemStatus(engineRef.current.systemStatus);
            setScaleMode(saved.visualSettings?.scaleMode || 'readable');
            sceneRef.current.scaleTransform.setMode(saved.visualSettings?.scaleMode || 'readable');
            setShowFuture(saved.visualSettings?.showFuture ?? true);
            setShowSensitivity(saved.visualSettings?.showSensitivity ?? false);
            setGravityGridVisible(saved.visualSettings?.showGravityGrid ?? false);
            sceneRef.current.gravityGrid.getMesh().visible = saved.visualSettings?.showGravityGrid ?? false;
            setCollisionsEnabled(saved.simulationSettings?.enableCollisions ?? true);
            setTimeScale(saved.simulationSettings?.timeScale ?? 1.0);
            sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
            setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
            logger.info('boot', `Restored autosave "${pName}"`);
          }
        }
      })
      .catch((err) => {
        logger.warn('boot', 'Startup restore skipped; proceeding with demonstration system', err);
      })
      .finally(() => {
        setBootProgress(0.9);
        setBootStage('First light…');
      });

    // Onboarding for first-run architects.
    if (!settingsStore.get().onboardingCompleted) {
      setTimeout(() => setShowOnboarding(true), 900);
    }

    // Apply stored audio preferences.
    audioSynth.setVolume(settingsStore.get().audioVolume);
    audioSynth.isEnabled = settingsStore.get().audioEnabled;

    // 8. Master Animation Loop (requestAnimationFrame)
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameTicker = 0;
    let bootedFlag = false;

    const tick = (now: number) => {
      const deltaSec = (now - lastTime) / 1000.0;
      lastTime = now;
      perfRef.current?.beginFrame(now);

      engine.update(deltaSec);

      sceneMgr.syncBodies(engine.bodies, engine.belts);
      sceneMgr.update(deltaSec);
      sceneMgr.render();
      perfRef.current?.endFrame();

      frameTicker++;
      if (frameTicker % 10 === 0) {
        setSimTimeSec(engine.timeSec);
        setEventCount(engine.events.length);
        setSystemStatus(engine.systemStatus);
        setFrameCount(f => f + 1);

        // Live dynamical-event monitor (GAME05–07).
        const monitor = monitorRef.current;
        if (monitor && !engine.isPaused) {
          const freshEvents = monitor.update(engine.bodies, engine.timeSec);
          for (const ev of freshEvents) {
            engine.events.push(ev);
            if (ev.severity === 'catastrophe') {
              audioSynth.playCollisionWarning();
              toastRef.current.push({ kind: 'error', title: ev.title, detail: ev.description, durationMs: 6000 });
            } else if (ev.type === 'orbit_unbound') {
              toastRef.current.push({ kind: 'warning', title: ev.title, detail: 'The body will leave the system unless captured.' });
            }
          }
          if (freshEvents.length > 0) setEventCount(engine.events.length);
        }

        if (showFutureRef.current && futureClientRef.current && !engine.isPaused) {
          futureClientRef.current.requestForecast(engine.bodies, {
            selectedBodyId: sceneMgr.selectedBodyId,
            calculateSensitivity: showSensitivityRef.current,
          });
        }

        // Debounced autosave with authoritative checkpointing (~5s).
        if (frameTicker % 300 === 0 && branchManagerRef.current && engineRef.current && sceneRef.current && autosaveRef.current) {
          const autoSaveProject = createSerializableProject(
            projectNameRef.current,
            branchManagerRef.current,
            engineRef.current,
            {
              scaleMode: scaleModeRef.current,
              showFuture: showFutureRef.current,
              showSensitivity: showSensitivityRef.current,
              showGravityGrid: sceneRef.current.gravityGrid.getMesh().visible,
            },
            {
              target: { x: sceneRef.current.cameraTarget.x, y: sceneRef.current.cameraTarget.y, z: sceneRef.current.cameraTarget.z },
              distance: 250,
              viewMode: sceneRef.current.viewMode,
            },
            PLANNER_CONFIG.persistence.autosaveSlotId
          );
          autosaveRef.current.requestSave(autoSaveProject);
        }
      }

      if (!bootedFlag && frameTicker > 5) {
        bootedFlag = true;
        setBootProgress(1);
        setBootStage('First light');
        setTimeout(() => setBooted(true), 250);
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

    const handleBeforeUnload = () => {
      void autosaveRef.current?.flush();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      for (const unsub of unsubs) unsub();
      challenges.destroy();
      autosave.destroy();
      pointerMgr.destroy();
      futureClient.destroy();
      grabThrow.destroy();
      sceneMgr.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === KEYBOARD SHORTCUTS (UI01) ===
  useEffect(() => {
    const anyModalOpen =
      isCreateModalOpen || isCanonLabOpen || isLedgerOpen || isCompareOpen || isForkOpen ||
      isStatsOpen || isSettingsOpen || isHelpOpen || showOnboarding || confirmState !== null ||
      importError !== null || pendingOrbit !== null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === ' ' && e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return;
      const id = shortcutIdForEvent(e);
      if (!id) return;
      if (id === 'close-top') {
        if (!anyModalOpen) handleSelectBody(null);
        return; // open modals consume Escape via focus-trap
      }
      if (anyModalOpen && id !== 'toggle-pause') return;
      switch (id) {
        case 'toggle-pause': e.preventDefault(); handleTogglePause(); break;
        case 'step-once': handleStepOnce(); break;
        case 'faster': {
          const next = TIME_LADDER.find((s) => s > timeScaleRef.current) ?? 100000;
          handleSetTimeScale(next);
          break;
        }
        case 'slower': {
          const below = [...TIME_LADDER].reverse().find((s) => s < timeScaleRef.current) ?? 1;
          handleSetTimeScale(below);
          break;
        }
        case 'tool-select': setActiveTool('select'); break;
        case 'tool-grab': setActiveTool('grab_throw'); break;
        case 'tool-loom': setActiveTool('orbit_loom'); break;
        case 'tool-create': setIsCreateModalOpen(true); break;
        case 'focus-selected':
          if (selectedBodyIdRef.current && sceneRef.current) {
            sceneRef.current.viewMode = 'focus_selected';
            audioSynth.playTick();
          }
          break;
        case 'follow-toggle': handleToggleFollow(); break;
        case 'top-down': handleToggleTopDown(); break;
        case 'center-camera':
          if (sceneRef.current) {
            sceneRef.current.viewMode = 'inertial';
            sceneRef.current.cameraTarget.set(0, 0, 0);
            setFollowEnabled(false);
            setTopDownEnabled(false);
          }
          break;
        case 'undo': e.preventDefault(); handleUndo(); break;
        case 'delete-body':
          if (selectedBodyIdRef.current) requestDeleteBody(selectedBodyIdRef.current);
          break;
        case 'toggle-grid': handleToggleGravityGrid(); break;
        case 'toggle-hz': handleToggleHz(); break;
        case 'fork-branch': setIsForkOpen(true); break;
        case 'open-ledger': setIsLedgerOpen(true); break;
        case 'open-navigator': handleToggleNavigator(); break;
        case 'open-missions': setMissionsVisible((v) => !v); break;
        case 'open-stats': setIsStatsOpen(true); break;
        case 'open-help': setIsHelpOpen(true); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCreateModalOpen, isCanonLabOpen, isLedgerOpen, isCompareOpen, isForkOpen,
    isStatsOpen, isSettingsOpen, isHelpOpen, showOnboarding, confirmState, importError, pendingOrbit,
  ]);

  // Controls & Action Handlers
  const handleTogglePause = () => {
    if (engineRef.current) {
      engineRef.current.isPaused = !engineRef.current.isPaused;
      setIsPaused(engineRef.current.isPaused);
      isPausedRef.current = engineRef.current.isPaused;
      audioSynth.playTick();
    }
  };

  const handleStepOnce = () => {
    if (engineRef.current && sceneRef.current) {
      const ok = engineRef.current.stepOnce();
      sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
      setSimTimeSec(engineRef.current.timeSec);
      setEventCount(engineRef.current.events.length);
      audioSynth.playTick();
      if (!ok) {
        toast.push({ kind: 'error', title: 'Step failed', detail: 'Integrator reported instability at this step.' });
      }
    }
  };

  const handleSetTimeScale = (scale: number) => {
    if (engineRef.current) {
      engineRef.current.timeScale = scale;
      setTimeScale(scale);
      timeScaleRef.current = scale;
      audioSynth.playTick();
    }
  };

  const handleToggleScaleMode = () => {
    if (sceneRef.current) {
      const next = scaleMode === 'readable' ? 'true' : 'readable';
      sceneRef.current.scaleTransform.setMode(next);
      setScaleMode(next);
      scaleModeRef.current = next;
      audioSynth.playTick();
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

  const handleToggleHz = () => {
    if (sceneRef.current && engineRef.current) {
      const next = !hzVisible;
      sceneRef.current.habitableZones.setVisible(next);
      if (next) sceneRef.current.habitableZones.update(engineRef.current.bodies);
      setHzVisible(next);
      audioSynth.playTick();
      if (next) {
        toast.push({ kind: 'info', title: 'Habitable zones revealed', detail: 'Emerald bands mark liquid-water orbits around luminous stars.' });
      }
    }
  };

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioSynth.isEnabled = next;
    setAudioEnabled(next);
    setSettings(settingsStore.update({ audioEnabled: next }));
    if (next) audioSynth.playTick();
  };

  const handleToggleFollow = () => {
    if (!sceneRef.current) return;
    if (followEnabled) {
      sceneRef.current.viewMode = 'inertial';
      setFollowEnabled(false);
    } else {
      if (!selectedBodyIdRef.current) {
        toast.push({ kind: 'info', title: 'Nothing to follow', detail: 'Select a body first, then engage follow-camera.' });
        return;
      }
      sceneRef.current.viewMode = 'follow_selected';
      setFollowEnabled(true);
      setTopDownEnabled(false);
    }
    audioSynth.playTick();
  };

  const handleToggleTopDown = () => {
    if (!sceneRef.current) return;
    if (topDownEnabled) {
      sceneRef.current.setViewMode(followEnabled ? 'follow_selected' : 'inertial');
      setTopDownEnabled(false);
    } else {
      sceneRef.current.setViewMode('top_down');
      setTopDownEnabled(true);
      setFollowEnabled(false);
    }
    audioSynth.playTick();
  };

  const handleToggleNavigator = () => {
    const next = !navigatorVisible;
    setNavigatorVisible(next);
    setSettings(settingsStore.update({ navigatorVisible: next }));
  };

  const handleUpdateSettings = (patch: Partial<PlannerSettings>) => {
    setSettings(settingsStore.update(patch));
  };

  // Undo (GAME08)
  const handleUndo = () => {
    if (!engineRef.current || !sceneRef.current || !undoStackRef.current) return;
    const entry = undoStackRef.current.undo(engineRef.current);
    if (!entry) {
      toast.push({ kind: 'info', title: 'Nothing to undo', detail: 'Destructive actions become undoable automatically.' });
      return;
    }
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    setSystemStatus(engineRef.current.systemStatus);
    setEventCount(engineRef.current.events.length);
    setSimTimeSec(engineRef.current.timeSec);
    setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engineRef.current.bodies));
    monitorRef.current?.reset();
    eventBus.emit('body:restored', { label: entry.label });
    toast.push({ kind: 'success', title: `Undone: ${entry.label}`, detail: 'Prior system state restored exactly.' });
    audioSynth.playTick();
  };

  // Branching: Fork Branch (UI04 modal)
  const handleForkBranch = (name: string) => {
    if (branchManagerRef.current && engineRef.current) {
      const newBranch = branchManagerRef.current.forkBranch(name, engineRef.current);
      setBranches(branchManagerRef.current.getAllBranches());
      setActiveBranchId(newBranch.id);
      setIsForkOpen(false);
      eventBus.emit('branch:forked', { branchId: newBranch.id, name });
      audioSynth.playSuccess();
      toast.push({ kind: 'success', title: `Forked: ${name}`, detail: 'The parent timeline is preserved untouched.' });
    }
  };

  // Branching: Switch Branch
  const handleSwitchBranch = (id: string) => {
    if (branchManagerRef.current && engineRef.current && sceneRef.current) {
      branchManagerRef.current.switchBranch(id, engineRef.current);
      setActiveBranchId(id);
      setSystemStatus(engineRef.current.systemStatus);
      sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
      setSelectedBodyId(null);
      selectedBodyIdRef.current = null;
      sceneRef.current.setSelectedBody(null);
      monitorRef.current?.reset();
      alertTrackerRef.current?.clear();
      setForecastAlerts([]);
      eventBus.emit('branch:switched', { branchId: id });
      audioSynth.playTick();
    }
  };

  // Load Presets (with undo checkpoint + confirm for destructive replacement)
  const doLoadPreset = (presetType: PresetKind) => {
    if (!engineRef.current || !sceneRef.current) return;

    let preset: { bodies: CelestialBody[]; belts?: any[] };
    let pName = '';

    if (presetType === 'demo') {
      preset = createDemonstrationSystem();
      pName = 'Kallisto Demonstration System';
    } else if (presetType === 'meridian') {
      preset = createMeridianPreset();
      pName = 'Virgil & Meridian Reference Study';
    } else if (presetType === 'procedural') {
      const seed = Math.floor(Math.random() * 90000) + 1000;
      const gen = createProceduralSystem(seed);
      preset = { bodies: gen.bodies, belts: gen.belts };
      pName = `${gen.bodies[0]?.name.replace(' Prime', '') ?? 'Seeded'} System · #${seed}`;
      toast.push({
        kind: 'info',
        title: `Procedural system #${seed}`,
        detail: `${gen.bodies.length} bodies around a class-${gen.starClass.class} star.`,
      });
    } else {
      preset = createBlankSystem();
      pName = 'Blank System';
    }

    undoStackRef.current?.checkpoint(engineRef.current, 'preset-load', `Load ${pName}`);

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

    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    setSelectedBodyId(null);
    selectedBodyIdRef.current = null;
    sceneRef.current.setSelectedBody(null);
    monitorRef.current?.reset();
    alertTrackerRef.current?.clear();
    setForecastAlerts([]);

    setProjectName(pName);
    setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
    audioSynth.playTick();
    eventBus.emit('project:loaded', { preset: presetType, name: pName });
  };

  const handleLoadPreset = (presetType: PresetKind) => {
    const hasWork = (engineRef.current?.events.length ?? 0) > 0;
    if (hasWork) {
      setConfirmState({
        title: 'Replace current system?',
        message: 'Loading a preset replaces the live system. Your autosave is preserved and this action is undoable — but unsaved branches will be lost.',
        confirmLabel: 'Load Preset',
        onConfirm: () => {
          setConfirmState(null);
          void autosaveRef.current?.flush();
          doLoadPreset(presetType);
        },
      });
      return;
    }
    doLoadPreset(presetType);
  };

  // Execute Canon Macro (with undo + bus + toast)
  const handleExecuteMacro = (macro: CanonMacro, targetId?: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    undoStackRef.current?.checkpoint(engineRef.current, 'macro', macro.label);
    const ev = macro.apply(engineRef.current, targetId);
    if (ev) {
      if (macro.id === 'pull-starsilk' || macro.id === 'starbinding-study') {
        audioSynth.playStarCollapse();
        sceneRef.current.spawnCollisionBurstAtBody(targetId ?? engineRef.current.bodies[0]?.id ?? '', '#0cc6ff', 2);
      } else {
        audioSynth.playTick();
      }
      setSystemStatus(engineRef.current.systemStatus);
      branchManagerRef.current?.checkpointActiveBranch(engineRef.current);
      sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
      setEventCount(engineRef.current.events.length);
      setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engineRef.current.bodies));
      setIsCanonLabOpen(false);
      eventBus.emit('macro:executed', { macroId: macro.id, targetId });
      toast.push({
        kind: macro.id === 'pull-starsilk' || macro.id === 'starbinding-study' ? 'error' : 'success',
        title: macro.label,
        detail: ev.description,
        durationMs: 6000,
      });
    }
  };

  // Spawn WorldsVault Template
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
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    handleSelectBody(newWorld.id);
    audioSynth.playTick();
    toast.push({ kind: 'info', title: `Spawned ${tmpl.name}`, detail: 'Demo orbit — coordinates unauthored in source.' });
  };

  // Clone body (GAME09)
  const handleCloneBody = (body: CelestialBody) => {
    if (!engineRef.current || !sceneRef.current) return;
    const clone: CelestialBody = {
      ...JSON.parse(JSON.stringify(body)) as CelestialBody,
      id: `clone-${body.id}-${Date.now()}`,
      name: `${body.name} II`,
      position: { x: body.position.x + body.radiusKm * 6, y: body.position.y, z: body.position.z + body.radiusKm * 6 },
    };
    engineRef.current.addBody(clone);
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    handleSelectBody(clone.id);
    toast.push({ kind: 'success', title: `Duplicated ${body.name}`, detail: 'The twin drifts nearby with identical momentum.' });
  };

  // Maneuvers (GAME10–12)
  const resolvePrimary = (body: CelestialBody): CelestialBody | null => {
    if (!engineRef.current) return null;
    return (
      engineRef.current.bodies.find((b) => b.id === body.primaryId) ??
      engineRef.current.bodies.find((b) => b.id !== body.id && b.type === 'star') ??
      null
    );
  };

  const afterManeuverSync = (label: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    setEventCount(engineRef.current.events.length);
    setFrameCount((f) => f + 1);
    if (showFutureRef.current && futureClientRef.current) {
      futureClientRef.current.requestForecast(engineRef.current.bodies, {
        selectedBodyId: selectedBodyIdRef.current,
        calculateSensitivity: showSensitivityRef.current,
      });
    }
    audioSynth.playOrbitLock();
    toast.push({ kind: 'success', title: 'Maneuver executed', detail: label });
  };

  const handleNudge = (body: CelestialBody, direction: NudgeDirection, dvKmS: number) => {
    const primary = resolvePrimary(body);
    if (!primary || !engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    const result = applyNudge(live, primary, direction, dvKmS);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Maneuver rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: `nudge-${Date.now()}`,
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Maneuver: ${live.name}`,
      description: `${result.detail} relative to ${primary.name}.`,
      bodyIds: [live.id],
      severity: 'info',
    });
    afterManeuverSync(`${live.name}: ${result.detail}`);
  };

  const handleCircularize = (body: CelestialBody) => {
    const primary = resolvePrimary(body);
    if (!primary || !engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    const result = circularizeOrbit(live, primary);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Circularization rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: `circ-${Date.now()}`,
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Circularized: ${live.name}`,
      description: result.detail,
      bodyIds: [live.id],
      severity: 'info',
    });
    eventBus.emit('orbit:circularized', { bodyId: live.id });
    afterManeuverSync(`${live.name}: ${result.detail}`);
  };

  const handleMatchVelocity = (body: CelestialBody, targetId: string) => {
    if (!engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    const target = engineRef.current.bodies.find((b) => b.id === targetId);
    if (!live || !target) return;
    const result = matchVelocity(live, target);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Rendezvous rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: `rendez-${Date.now()}`,
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Rendezvous: ${live.name} → ${target.name}`,
      description: result.detail,
      bodyIds: [live.id, target.id],
      severity: 'info',
    });
    afterManeuverSync(result.detail);
  };

  // Delete with confirm + undo (UI10 + GAME08)
  const requestDeleteBody = (id: string) => {
    const body = engineRef.current?.bodies.find((b) => b.id === id);
    if (!body) return;
    setConfirmState({
      title: `Delete ${body.name}?`,
      message: `${body.name} (${body.type}) will be removed from the live simulation and the event ledger will record the removal. This can be undone immediately.`,
      confirmLabel: 'Delete Body',
      onConfirm: () => {
        setConfirmState(null);
        if (engineRef.current && sceneRef.current && undoStackRef.current) {
          undoStackRef.current.checkpoint(engineRef.current, 'delete-body', `Delete ${body.name}`);
          engineRef.current.removeBody(id);
          sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
          setSelectedBodyId(null);
          selectedBodyIdRef.current = null;
          sceneRef.current.setSelectedBody(null);
          setEventCount(engineRef.current.events.length);
          audioSynth.playTick();
          toast.push({
            kind: 'warning',
            title: `Deleted ${body.name}`,
            detail: 'The removal is etched in the ledger.',
            action: { label: 'Undo', onSelect: () => handleUndo() },
          });
        }
      },
    });
  };

  // Export / Import (UI05: toasts + error dialog)
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
      },
      {
        target: { x: 0, y: 0, z: 0 },
        distance: 250,
        viewMode: sceneRef.current.viewMode,
      },
      `proj-${Date.now()}`
    );
    downloadProjectFile(project);
    eventBus.emit('project:exported', { projectId: project.projectId });
    toast.push({ kind: 'success', title: 'System exported', detail: `${project.projectName}.ssp.json downloaded.` });
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.ssp.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const raw = re.target?.result as string;
          const { project, migrated, migrationNotes } = parseProjectWithMigration(raw);
          if (engineRef.current && sceneRef.current && undoStackRef.current) {
            undoStackRef.current.checkpoint(engineRef.current, 'bulk', `Import ${project.projectName}`);
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
            sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
            setSigilSvg(generateSystemSigilSvg(project.projectName, engineRef.current.bodies));
            monitorRef.current?.reset();
            audioSynth.playTick();
            eventBus.emit('project:imported', { projectId: project.projectId, migrated });
            toast.push({
              kind: 'success',
              title: `Imported ${project.projectName}`,
              detail: migrated ? migrationNotes.join(' ') : 'Schema validated cleanly.',
            });
          }
        } catch (err: any) {
          logger.error('import', 'Project import failed', err);
          setImportError(err.message || 'Unknown import failure');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const selectedBody = engineRef.current?.bodies.find(b => b.id === selectedBodyId) || null;
  const selectedPrimary = selectedBody
    ? engineRef.current?.bodies.find((b) => b.id === selectedBody.primaryId) ??
      engineRef.current?.bodies.find((b) => b.id !== selectedBody.id && b.type === 'star') ??
      null
    : null;

  const anyModalOpen =
    isCreateModalOpen || isCanonLabOpen || isLedgerOpen || isCompareOpen || isForkOpen ||
    isStatsOpen || isSettingsOpen || isHelpOpen || showOnboarding || confirmState !== null ||
    importError !== null;

  const downloadDiagnostics = () => {
    const blob = new Blob(
      [logger.exportDiagnostics({ capabilities, projectName, simTimeSec })],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'starsilk-diagnostics.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="planner-viewport">
      {!booted && (
        <BootSplash
          stage={bootStage}
          progress={bootProgress}
          capabilities={capabilities}
          onDownloadDiagnostics={downloadDiagnostics}
        />
      )}

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="universe-canvas" />

      {/* Primary HUD Overlay */}
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
          audioEnabled={audioEnabled}
          onToggleAudio={handleToggleAudio}
          gravityGridVisible={gravityGridVisible}
          onToggleGravityGrid={handleToggleGravityGrid}
          hzVisible={hzVisible}
          onToggleHz={handleToggleHz}
          onExport={handleExport}
          onImport={handleImport}
          onLoadPreset={handleLoadPreset}
          undoDepth={undoDepth}
          onUndo={handleUndo}
          autosaveStatus={capabilities?.indexedDb === false ? 'disabled' : autosaveStatus}
          autosaveAtMs={autosaveAtMs}
          fps={fps}
          navigatorVisible={navigatorVisible}
          onToggleNavigator={handleToggleNavigator}
          missionsVisible={missionsVisible}
          onToggleMissions={() => setMissionsVisible(!missionsVisible)}
          missionsDone={challenges.filter((c) => c.completed).length}
          missionsTotal={CHALLENGE_DEFINITIONS.length}
          onOpenStats={() => setIsStatsOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
        />

        {/* Forecast impact banner (GAME04) */}
        {forecastAlerts.length > 0 && (
          <div className="forecast-banner hud-interactive" role="alert">
            <span className={`forecast-dot ${forecastAlerts[0].severity}`} />
            <button
              className="forecast-text"
              onClick={() => handleSelectBody(forecastAlerts[0].bodyAId)}
              title="Select threatened body"
            >
              {forecastAlerts[0].severity === 'imminent' ? 'IMMINENT IMPACT' : 'IMPACT FORECAST'}:{' '}
              {forecastAlerts[0].bodyAName} → {forecastAlerts[0].bodyBName} in{' '}
              {formatCountdown(forecastAlerts[0].timeToImpactSec)}
              {forecastAlerts.length > 1 ? ` (+${forecastAlerts.length - 1} more)` : ''}
            </button>
          </div>
        )}

        {/* Center Canvas Area (Tap void handled by pointer-manager) */}
        <div style={{ flex: 1, pointerEvents: 'none' }} />

        {/* Contextual HUD hint (onboarding support) */}
        {settings.showHudHints && !selectedBody && !anyModalOpen && booted && (
          <div className="hud-hint hud-interactive">
            Tap a world to inspect · <b>2</b> grab · <b>3</b> loom · <b>?</b> shortcuts
          </div>
        )}

        {/* Selected Body Inspector */}
        {selectedBody && (
          <ContextInspector
            selectedBody={selectedBody}
            allBodies={engineRef.current?.bodies || []}
            onUpdateBody={(updated) => {
              if (engineRef.current && sceneRef.current) {
                const idx = engineRef.current.bodies.findIndex(b => b.id === updated.id);
                if (idx !== -1) {
                  engineRef.current.bodies[idx] = updated;
                  sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
                  setFrameCount(f => f + 1);
                }
              }
            }}
            onDeleteBody={requestDeleteBody}
            onFocusBody={() => {
              if (sceneRef.current) {
                sceneRef.current.viewMode = 'focus_selected';
              }
            }}
            onStartGrabThrow={(body) => {
              setActiveTool('grab_throw');
              grabThrowRef.current?.startGrab(body);
            }}
            onOpenCanonMacro={() => {
              setIsCanonLabOpen(true);
            }}
            onCloneBody={handleCloneBody}
            onNudge={handleNudge}
            onCircularize={handleCircularize}
            onMatchVelocity={handleMatchVelocity}
          />
        )}

        {/* Selection breadcrumb chip (UI14) */}
        {selectedBody && !anyModalOpen && (
          <SelectionChip
            selected={selectedBody}
            primary={selectedPrimary}
            onFocus={() => {
              if (sceneRef.current) sceneRef.current.viewMode = 'focus_selected';
            }}
            onGrab={() => {
              setActiveTool('grab_throw');
              grabThrowRef.current?.startGrab(selectedBody);
            }}
            onDeselect={() => handleSelectBody(null)}
          />
        )}

        {/* Bottom Timeline Bar */}
        <TimelineBar
          timeSec={simTimeSec}
          timeScale={timeScale}
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
          onSetTimeScale={handleSetTimeScale}
          onStepOnce={handleStepOnce}
          followEnabled={followEnabled}
          onToggleFollow={handleToggleFollow}
          topDownEnabled={topDownEnabled}
          onToggleTopDown={handleToggleTopDown}
          branches={branches}
          activeBranchId={activeBranchId}
          onSwitchBranch={handleSwitchBranch}
          onForkBranch={() => setIsForkOpen(true)}
          onOpenLedger={() => setIsLedgerOpen(true)}
          onOpenBranchCompare={() => setIsCompareOpen(true)}
          eventCount={eventCount}
        />
      </div>

      {/* Left Vertical Tool Rail */}
      <ToolRail
        activeTool={activeTool}
        onSelectTool={(t) => {
          setActiveTool(t);
          audioSynth.playTick();
        }}
        showFuture={showFuture}
        onToggleShowFuture={() => setShowFuture(!showFuture)}
        showSensitivity={showSensitivity}
        onToggleShowSensitivity={() => setShowSensitivity(!showSensitivity)}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenCanonLab={() => setIsCanonLabOpen(true)}
        onResetCamera={() => {
          if (sceneRef.current) {
            sceneRef.current.viewMode = 'inertial';
            sceneRef.current.cameraTarget.set(0, 0, 0);
            setFollowEnabled(false);
            setTopDownEnabled(false);
          }
        }}
      />

      {/* System navigator (UI07) */}
      {navigatorVisible && booted && (
        <SystemNavigator
          bodies={engineRef.current?.bodies || []}
          selectedBodyId={selectedBodyId}
          onSelectBody={handleSelectBody}
          onFocusBody={(id) => {
            handleSelectBody(id);
            if (sceneRef.current) sceneRef.current.viewMode = 'focus_selected';
          }}
          onClose={handleToggleNavigator}
        />
      )}

      {/* Missions panel (GAME14) */}
      {missionsVisible && (
        <MissionsPanel
          definitions={CHALLENGE_DEFINITIONS}
          states={challenges}
          onClose={() => setMissionsVisible(false)}
          onReset={() => challengeTrackerRef.current?.resetAll()}
        />
      )}

      {/* Orbit Loom Conic Confirmation Overlay */}
      {pendingOrbit && (
        <OrbitLoomConfirmModal
          fittedOrbit={pendingOrbit}
          primaryBody={orbitLoomRef.current?.getPrimary() || null}
          selectedBody={selectedBody}
          allBodies={engineRef.current?.bodies || []}
          onApplyToBody={(targetBody) => {
            if (orbitLoomRef.current && engineRef.current && sceneRef.current) {
              const prim = orbitLoomRef.current.getPrimary();
              const success = orbitLoomRef.current.applyToBody(targetBody);
              if (success && prim) {
                sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
                audioSynth.playOrbitLock();
                engineRef.current.events.push({
                  id: `loom-${Date.now()}`,
                  timestampSec: engineRef.current.timeSec,
                  type: 'body_created',
                  title: `Orbit Fitted: ${targetBody.name}`,
                  description: `${targetBody.name} assigned to fitted Keplerian orbit around ${prim.name} (a=${(pendingOrbit.semiMajorAxisKm / 149597870.7).toFixed(3)} AU, e=${pendingOrbit.eccentricity.toFixed(3)}).`,
                  bodyIds: [targetBody.id, prim.id],
                  severity: 'info',
                });
                eventBus.emit('orbit:fitted', { bodyId: targetBody.id, primaryId: prim.id });
                setEventCount(engineRef.current.events.length);
                if (showFutureRef.current && futureClientRef.current) {
                  futureClientRef.current.requestForecast(engineRef.current.bodies, {
                    selectedBodyId: targetBody.id,
                    calculateSensitivity: showSensitivityRef.current,
                  });
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
                sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
                audioSynth.playOrbitLock();
                engineRef.current.events.push({
                  id: `ring-${Date.now()}`,
                  timestampSec: engineRef.current.timeSec,
                  type: 'body_created',
                  title: `Orbital Ring Created around ${prim.name}`,
                  description: `Engineered orbital ring (${(ring.innerRadiusKm / 1000).toFixed(0)}k - ${(ring.outerRadiusKm / 1000).toFixed(0)}k km) established.`,
                  bodyIds: [prim.id],
                  severity: 'info',
                });
                eventBus.emit('orbit:fitted', { kind: 'ring', primaryId: prim.id });
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

      {/* Modals */}
      {showOnboarding && (
        <OnboardingOverlay
          onComplete={() => {
            setShowOnboarding(false);
            setSettings(settingsStore.update({ onboardingCompleted: true }));
          }}
          onSkip={() => {
            setShowOnboarding(false);
            setSettings(settingsStore.update({ onboardingCompleted: true }));
          }}
        />
      )}

      {isForkOpen && (
        <ForkBranchModal
          branches={branches}
          suggestedName={`Branch @ ${Math.round(simTimeSec)}s`}
          onFork={handleForkBranch}
          onClose={() => setIsForkOpen(false)}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {importError && (
        <ConfirmDialog
          title="Import failed"
          message={importError}
          confirmLabel="Understood"
          danger={false}
          onConfirm={() => setImportError(null)}
          onCancel={() => setImportError(null)}
        />
      )}

      {isCreateModalOpen && (
        <CreateBodyModal
          existingBodies={engineRef.current?.bodies || []}
          onSpawnBody={(newBody) => {
            if (engineRef.current) {
              engineRef.current.addBody(newBody);
              sceneRef.current?.syncBodies(engineRef.current.bodies, engineRef.current.belts);
              handleSelectBody(newBody.id);
              toast.push({ kind: 'success', title: `Created ${newBody.name}`, detail: `${newBody.type} placed on a stable circular orbit.` });
            }
          }}
          onClose={() => setIsCreateModalOpen(false)}
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

      {isStatsOpen && (
        <SystemStatsModal
          bodies={engineRef.current?.bodies || []}
          simTimeSec={simTimeSec}
          eventCount={eventCount}
          onClose={() => setIsStatsOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={handleUpdateSettings}
          onReset={() => setSettings(settingsStore.reset())}
          onReplayTour={() => {
            setIsSettingsOpen(false);
            setShowOnboarding(true);
          }}
          onExportDiagnostics={downloadDiagnostics}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isHelpOpen && <ShortcutsModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <PlannerApp />
  </ToastProvider>
);

export default App;
