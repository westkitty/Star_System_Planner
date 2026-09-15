import React, { useEffect, useMemo, useRef, useState } from 'react';

/** Shared toast contract retained for the forensic toast renderer. */
export interface ToastItem { id: number; message: string; kind: 'info' | 'warn' | 'ok'; }
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
import { downloadProjectFile } from './persistence/export-import';
import { createSerializableProject } from './persistence/serializer';
import { AutosaveManager, AutosaveStatus } from './persistence/autosave';
import { audioSynth } from './audio/audio-synth';
import { audibleOrrery } from './audio/orrery';
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
import { createId } from './core/id';
import { getCachedElements } from './simulation/element-cache';
import { toUserMessage } from './core/errors';
import { checkPendingRecovery, clearPendingRecovery, markSessionDirty } from './core/recovery';
import { SnapshotBuffer } from './simulation/snapshot-buffer';
import { AssistTracker } from './simulation/gravity-assists';
import { ContractTracker, CONTRACT_DEFINITIONS } from './simulation/contracts';
import { planHohmann, applyTransferDeparture } from './simulation/transfer-planner';
import { mergeBodiesInelastic } from './simulation/collisions';
import { sampleEphemeris, ephemerisToCsv } from './simulation/ephemeris';
import { divergencePercent } from './branching/branch-manager';
import { listLibrary, saveToLibrary, loadFromLibrary, deleteFromLibrary, LibraryEntry } from './persistence/project-library';
import { applyPwaUpdate } from './main';
import { disposalRegistry } from './rendering/disposal';

// UI Components
import { TopBar, AppMode, PresetKind } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { shortcutHintFor } from './ui/shortcuts';
import { ImportDiagnosticsDialog } from './ui/ImportDiagnosticsDialog';
import { PanelErrorBoundary } from './ui/PanelErrorBoundary';
import { parseProjectWithDiagnostics } from './persistence/export-import';
import type { ValidationIssue } from './persistence/validation';
import { planTrojanPair } from './simulation/orbital-mechanics';
import { applyArrivalBurn, planArrivalBurn } from './simulation/transfer-planner';
import { computeArchitectScore } from './simulation/architect-score';
import { discoveryCodex } from './simulation/discovery-codex';
import type { DiscoveryKind } from './simulation/discovery-codex';
import { SeededRng } from './core/seeded-rng';
import { collectDiagnostics } from './core/diagnostics';
import { computeSystemStatistics } from './simulation/system-stats';
import { formatSimTime } from './simulation/units';
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
import { MissionsPanel, ContractCardState } from './ui/MissionsPanel';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { CommandPalette } from './ui/CommandPalette';
import { registerCommands, unregisterCommand } from './ui/command-registry';
import { Coachmark } from './ui/Coachmark';
import { CoachmarkId, dismissCoachmark, shouldShowCoachmark } from './ui/coachmarks';
import { Announcer, announce } from './ui/Announcer';
import { WarpStreaks } from './ui/WarpStreaks';
import { MonitorWarningSummary } from './simulation/event-monitor';

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
  const snapshotBufferRef = useRef<SnapshotBuffer | null>(null);
  const assistTrackerRef = useRef<AssistTracker | null>(null);
  const contractTrackerRef = useRef<ContractTracker | null>(null);
  const capturedIdsRef = useRef<Set<string>>(new Set());
  const prevTimeScaleRef = useRef<number>(1000);
  const slowmoTimerRef = useRef<number | null>(null);
  const autopilotNotifiedRef = useRef(false);
  const scrubIndexRef = useRef<number | null>(null);
  const forecastAlertsRef = useRef<ForecastAlert[]>([]);
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
  const [contractCards, setContractCards] = useState<ContractCardState[]>([]);
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [coachmark, setCoachmark] = useState<{ id: CoachmarkId; anchor: 'tool-rail' | 'timeline' | 'inspector' | 'center' } | null>(null);
  const [health, setHealth] = useState<MonitorWarningSummary>({ unbound: 0, roche: 0, thermalAlerts: 0 });
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [scrubCount, setScrubCount] = useState(0);
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
  scrubIndexRef.current = scrubIndex;
  forecastAlertsRef.current = forecastAlerts;

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
      if (shouldShowCoachmark('loom')) setCoachmark({ id: 'loom', anchor: 'tool-rail' });
    }
    if (activeTool === 'grab_throw' && shouldShowCoachmark('grab')) {
      setCoachmark({ id: 'grab', anchor: 'tool-rail' });
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

  // Apply settings side effects (audio, autosave, reduced motion, overlays).
  useEffect(() => {
    audioSynth.setVolume(settings.audioVolume);
    audioSynth.isEnabled = settings.audioEnabled;
    setAudioEnabled(settings.audioEnabled);
    if (settings.audioEnabled) audioSynth.startAmbience();
    else audioSynth.stopAmbience();
    autosaveRef.current?.setEnabled(settings.autosaveEnabled && capabilities?.indexedDb !== false);
    if (sceneRef.current) {
      sceneRef.current.reducedMotion = settings.reducedMotion;
      sceneRef.current.setVelocityVectorsVisible(settings.velocityVectorsVisible);
      sceneRef.current.setLabelsVisible(settings.bodyLabelsVisible);
      sceneRef.current.setAuRulerVisible(settings.auRulerVisible);
      sceneRef.current.setOrbitLinesVisible(settings.orbitLinesVisible);
    }
  }, [settings, capabilities]);

  // Iteration 3: selection history, eclipse memory, codex/debrief refresh, import diagnostics.
  const selectionHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const historyNavRef = useRef(false);
  const [historyPos, setHistoryPos] = useState({ index: -1, length: 0 });
  const lastEclipseRef = useRef<{ atMs: number; viewerId: string; occluderId: string } | null>(null);
  const [codexVersion, setCodexVersion] = useState(0);
  const [assistVersion, setAssistVersion] = useState(0);
  const [importDiagnostics, setImportDiagnostics] = useState<{ fileName: string; issues: ValidationIssue[]; notes: string[] } | null>(null);
  const recordCodex = (kind: DiscoveryKind, label: string): void => {
    discoveryCodex.record(kind, label);
    setCodexVersion((v) => v + 1);
  };

  // Selection side effects: follow-on-select + first-light challenge.
  const handleSelectBody = (id: string | null): void => {
    if (!historyNavRef.current && id) {
      const hist = selectionHistoryRef.current.slice(0, historyIndexRef.current + 1);
      if (hist[hist.length - 1] !== id) {
        hist.push(id);
        const trimmed = hist.slice(-20);
        selectionHistoryRef.current = trimmed;
        historyIndexRef.current = trimmed.length - 1;
        setHistoryPos({ index: trimmed.length - 1, length: trimmed.length });
      }
    }
    setSelectedBodyId(id);
    selectedBodyIdRef.current = id;
    sceneRef.current?.setSelectedBody(id);
    if (sceneRef.current && followEnabled) sceneRef.current.setFollowBody(id);
    if (id) {
      challengeTrackerRef.current?.credit('first-light');
      audioSynth.playSelect();
      const body = engineRef.current?.bodies.find((b) => b.id === id);
      if (body) {
        announce(`${body.name} selected. ${body.type}, ${(body.massKg / 5.972e24).toFixed(2)} Earth masses.`);
        if (body.primaryId && shouldShowCoachmark('transfer')) {
          setCoachmark({ id: 'transfer', anchor: 'inspector' });
        }
      }
      if (settingsRef.current.followOnSelect && sceneRef.current) {
        sceneRef.current.viewMode = 'follow_selected';
        sceneRef.current.setFollowBody(id);
        setFollowEnabled(true);
        setTopDownEnabled(false);
      }
    }
  };

  // Selection-history traversal (iteration 3, UI07).
  const selectionHistoryBack = (): void => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    const id = selectionHistoryRef.current[idx - 1];
    if (!id) return;
    historyNavRef.current = true;
    historyIndexRef.current = idx - 1;
    setHistoryPos({ index: idx - 1, length: selectionHistoryRef.current.length });
    handleSelectBody(id);
    historyNavRef.current = false;
  };

  const selectionHistoryForward = (): void => {
    const idx = historyIndexRef.current;
    const hist = selectionHistoryRef.current;
    if (idx < 0 || idx >= hist.length - 1) return;
    const id = hist[idx + 1];
    if (!id) return;
    historyNavRef.current = true;
    historyIndexRef.current = idx + 1;
    setHistoryPos({ index: idx + 1, length: hist.length });
    handleSelectBody(id);
    historyNavRef.current = false;
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
    engine.onCatastrophe = (event) => {
      engine.isPaused = true;
      isPausedRef.current = true;
      setIsPaused(true);
      audioSynth.playCollisionWarning();
      audibleOrrery.strike(event.severity === 'catastrophe' ? 0.9 : 0.5);
      if (event.bodyIds?.[0]) sceneMgr.spawnCollisionBurstAtBody(event.bodyIds[0], '#ff4d64', 1);
    };
    engineRef.current = engine;

    // 3. Initialize BranchManager
    const branchMgr = new BranchManager(engine, 'Prime Timeline');
    branchManagerRef.current = branchMgr;
    setBranches(branchMgr.getAllBranches());
    setActiveBranchId(branchMgr.activeBranchId);

    // 3b. Iteration-1 managers: undo, monitor, alerts, challenges, autosave, perf.
    const undoStack = new UndoStack();
    undoStack.subscribe((depth) => {
      setUndoDepth(depth);
      markSessionDirty();
    });
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
    snapshotBufferRef.current = new SnapshotBuffer(
      PLANNER_CONFIG.scrub.capacity,
      PLANNER_CONFIG.scrub.intervalSec
    );
    assistTrackerRef.current = new AssistTracker();
    contractTrackerRef.current = new ContractTracker();
    perf.observeLongTasks();

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
      // GAME15: catastrophe slow-motion — drop to 10× for 2.5s so the
      // impact reads, then restore the architect's pace.
      eventBus.on('collision:occurred', () => {
        const eng = engineRef.current;
        if (!eng || eng.isPaused || settingsRef.current.reducedMotion) return;
        if (eng.timeScale <= 10) return;
        prevTimeScaleRef.current = eng.timeScale;
        eng.timeScale = 10;
        setTimeScale(10);
        timeScaleRef.current = 10;
        announce('Collision. Time dilated to ten times for impact review.');
        pushToastGlobal({
          kind: 'warning',
          title: 'Slow motion',
          detail: 'Time dilated to 10× for the impact — pace restores in 2.5s.',
          durationMs: 2600,
        });
        if (slowmoTimerRef.current !== null) window.clearTimeout(slowmoTimerRef.current);
        slowmoTimerRef.current = window.setTimeout(() => {
          if (engineRef.current && !engineRef.current.isPaused) {
            engineRef.current.timeScale = prevTimeScaleRef.current;
            setTimeScale(prevTimeScaleRef.current);
            timeScaleRef.current = prevTimeScaleRef.current;
          }
          slowmoTimerRef.current = null;
        }, 2500);
      }),
      eventBus.on('orbit:captured', (e) => {
        const payload = e.payload as { bodyId?: string; primaryId?: string };
        if (payload.bodyId) capturedIdsRef.current.add(payload.bodyId);
        const bodies = engineRef.current?.bodies ?? [];
        const name = bodies.find((b) => b.id === payload.bodyId)?.name ?? 'wanderer';
        const primary = bodies.find((b) => b.id === payload.primaryId)?.name ?? 'a companion';
        audioSynth.playSuccess();
        audioSynth.playCaptureChord();
        recordCodex('capture', `${primary} seized ${name}`);
        pushToastGlobal({
          kind: 'success',
          title: `Captured: ${name}`,
          detail: `${primary} seized a wanderer into a bound orbit.`,
          durationMs: 6000,
        });
      }),
      eventBus.on('discovery:transit', (e) => recordCodex('transit', `Transit over ${engineRef.current?.bodies.find((b) => b.id === e.payload.viewerId)?.name ?? 'a world'}`)),
      eventBus.on('discovery:conjunction', (e) => recordCodex('conjunction', `${engineRef.current?.bodies.find((b) => b.id === e.payload.bodyAId)?.name ?? '?'} x ${engineRef.current?.bodies.find((b) => b.id === e.payload.bodyBId)?.name ?? '?'}`)),
      eventBus.on('discovery:resonance', (e) => recordCodex('resonance', `Resonance ${e.payload.ratioLabel}`)),
      eventBus.on('collision:occurred', () => {
        if (engineRef.current && branchManagerRef.current) branchManagerRef.current.checkpointActiveBranch(engineRef.current);
      }),
      eventBus.on('discovery:eclipse', (e) => {
        const payload = e.payload as { viewerId?: string; occluderId?: string; magnitude01?: number };
        if (payload.viewerId && payload.occluderId) {
          sceneMgr.spawnEclipseCone(payload.viewerId, payload.occluderId, payload.magnitude01 ?? 0.7);
          lastEclipseRef.current = { atMs: Date.now(), viewerId: payload.viewerId ?? '', occluderId: payload.occluderId ?? '' };
          audioSynth.playEclipseHush();
        }
        const bodies = engineRef.current?.bodies ?? [];
        const viewer = bodies.find((b) => b.id === payload.viewerId)?.name ?? 'a world';
        const occluder = bodies.find((b) => b.id === payload.occluderId)?.name ?? 'A companion';
        const depth = payload.magnitude01 !== undefined ? ` (${Math.round(payload.magnitude01 * 100)}% depth)` : '';
        recordCodex('eclipse', `Eclipse over ${viewer}${depth}`);
        pushToastGlobal({
          kind: 'info',
          title: `Eclipse over ${viewer}${depth}`,
          detail: `${occluder} veils the sun — shadow cone rendered.`,
          durationMs: 5000,
        });
      }),
      eventBus.on('assist:measured', (e) => {
        const payload = e.payload as { craftName?: string; planetName?: string; deltaVKmS?: number };
        audioSynth.playAssistChime();
        pushToastGlobal({
          kind: 'info',
          title: `Gravity assist: ${payload.craftName ?? 'craft'} @ ${payload.planetName ?? 'planet'}`,
          detail: `Slingshot ${payload.deltaVKmS !== undefined && payload.deltaVKmS >= 0 ? 'gain' : 'loss'} of ${Math.abs(payload.deltaVKmS ?? 0).toFixed(2)} km/s.`,
          durationMs: 5000,
        });
      }),
      eventBus.on('transfer:executed', (e) => {
        const payload = e.payload as { bodyName?: string; detail?: string };
        audioSynth.playOrbitLock();
        pushToastGlobal({
          kind: 'success',
          title: `Transfer burn: ${payload.bodyName ?? 'craft'}`,
          detail: payload.detail ?? 'Departure impulse applied.',
          durationMs: 6000,
        });
      }),
      eventBus.on('merge:executed', (e) => {
        const payload = e.payload as { survivorName?: string; detail?: string };
        audioSynth.playCollisionThump();
        pushToastGlobal({
          kind: 'warning',
          title: `Merged into ${payload.survivorName ?? 'survivor'}`,
          detail: payload.detail ?? 'Forecast merge executed.',
          durationMs: 6000,
        });
      }),
      eventBus.on('contract:completed', (e) => {
        const payload = e.payload as { contractId?: string; title?: string };
        void payload;
        audioSynth.playSuccess();
      }),
      eventBus.on('pwa:update-available', () => {
        pushToastGlobal({
          kind: 'info',
          title: 'Update available',
          detail: 'A new planner build is ready. Reload to apply it.',
          durationMs: 12000,
          action: {
            label: 'Reload now',
            onSelect: () => { applyPwaUpdate?.(); },
          },
        });
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
          id: createId('throw'),
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
            id: createId(`forecast-${alert.key}`),
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
      onWheelZoom: (deltaY) => {
        sceneMgr.zoomCamera(Math.exp(deltaY * 0.001));
      },
      onDoubleTap: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const hit = sceneMgr.raycastBody(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        if (hit) {
          handleSelectBody(hit);
          sceneMgr.setViewMode('focus_selected');
        }
      },
      onPenQuickAction: (e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const hit = sceneMgr.raycastBody(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        const body = hit ? engine.bodies.find((candidate) => candidate.id === hit) : undefined;
        if (!body) return;
        handleSelectBody(body.id);
        pointerMgr.isManipulatingObject = true;
        grabThrow.startGrab(body);
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
    let startupRestored = false;
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
            startupRestored = true;
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

    // === CRASH RECOVERY OFFER (BACK08) ===
    // A pending flag means the last session died without a clean shutdown.
    if (caps.indexedDb && checkPendingRecovery()) {
      window.setTimeout(() => {
        if (startupRestored) {
          // The autosave already healed the session — retire the flag silently.
          clearPendingRecovery();
          return;
        }
        pushToastGlobal({
          kind: 'warning',
          title: 'Session interrupted',
          detail: 'The last visit ended unexpectedly. Recover the autosave, or dismiss to keep the restored system.',
          durationMs: 15000,
          action: {
            label: 'Recover autosave',
            onSelect: () => {
              void (async () => {
                try {
                  const saved = await loadProjectFromDb(PLANNER_CONFIG.persistence.autosaveSlotId);
                  const active = saved?.branches.find((b) => b.id === saved.activeBranchId) ?? saved?.branches[0];
                  if (saved && active?.snapshot && engineRef.current && sceneRef.current) {
                    engineRef.current.restoreSnapshot(active.snapshot);
                    engineRef.current.events = [...(active.events ?? [])];
                    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
                    setSimTimeSec(engineRef.current.timeSec);
                    setEventCount(engineRef.current.events.length);
                    const bMgr = BranchManager.fromPersisted(saved.branches, saved.activeBranchId);
                    branchManagerRef.current = bMgr;
                    setBranches(bMgr.getAllBranches());
                    setActiveBranchId(bMgr.activeBranchId);
                    pushToastGlobal({ kind: 'success', title: 'Autosave recovered', detail: `Restored “${saved.projectName}”.` });
                    eventBus.emit('recovery:completed', { slotId: PLANNER_CONFIG.persistence.autosaveSlotId });
                  } else {
                    pushToastGlobal({ kind: 'info', title: 'Nothing to recover', detail: 'No autosave slot was found.' });
                  }
                } catch (err) {
                  pushToastGlobal({ kind: 'error', title: 'Recovery failed', detail: toUserMessage(err) });
                } finally {
                  clearPendingRecovery();
                }
              })();
            },
          },
        });
      }, 2500);
    }

    // === PROJECT LIBRARY INDEX (BACK03) ===
    if (caps.indexedDb) {
      void listLibrary()
        .then((entries) => setLibraryEntries(entries))
        .catch((err) => logger.warn('boot', 'Library index unavailable', err));
    }

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
      sceneMgr.syncDebris(engine.debris);
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
        if (monitor && frameTicker % 120 === 0) {
          const census = engine.bodies.length;
          monitor.setPairBudget(census > 220 ? 140 : census > 120 ? 220 : Number.POSITIVE_INFINITY);
        }
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
          setHealth(monitor.getWarningSummary());
        }

        // Time-scrub ring buffer (UI03): record live history when due.
        if (!engine.isPaused && scrubIndexRef.current === null) {
          const buf = snapshotBufferRef.current;
          if (buf && buf.recordIfDue(engine.timeSec, engine.bodies)) {
            setScrubCount(buf.size);
          }
        }

        // Gravity-assist meter (GAME07): celebrate measured slingshots.
        const assistTracker = assistTrackerRef.current;
        if (assistTracker && !engine.isPaused) {
          const assists = assistTracker.update(engine.bodies, engine.timeSec);
          for (const assist of assists) {
            engine.events.push(assist);
            eventBus.emit('assist:measured', {
              craftId: assist.craftId,
              planetId: assist.planetId,
              craftName: engine.bodies.find((b) => b.id === assist.craftId)?.name,
              planetName: engine.bodies.find((b) => b.id === assist.planetId)?.name,
              deltaVKmS: assist.deltaVKmS,
            });
            recordCodex('assist', `${assist.craftId} +${assist.deltaVKmS.toFixed(2)} km/s sling @ ${assist.planetId}`);
            setAssistVersion((v) => v + 1);
          }
          if (assists.length > 0) setEventCount(engine.events.length);
        }

        // Scenario contracts (MissionsPanel): evaluate at ~6 Hz.
        if (frameTicker % 60 === 0 && contractTrackerRef.current) {
          const tracker = contractTrackerRef.current;
          const ctx = { capturedBodyIds: [...capturedIdsRef.current], assistAtlas: assistTrackerRef.current?.grandTourAtlas() ?? {} };
          const fresh = tracker.evaluate(engine.bodies, ctx);
          for (const def of fresh) {
            audioSynth.playContractFanfare();
            eventBus.emit('contract:completed', { contractId: def.id, title: def.title });
            engine.events.push({
              id: createId('contract'),
              timestampSec: engine.timeSec,
              type: 'contract_complete',
              title: `Contract fulfilled: ${def.title}`,
              description: def.brief,
              bodyIds: [],
              severity: 'info',
            });
            toastRef.current.push({
              kind: 'success',
              title: `Contract fulfilled: ${def.title}`,
              detail: def.brief,
              durationMs: 7000,
            });
          }
          if (fresh.length > 0) setEventCount(engine.events.length);
          setContractCards(
            CONTRACT_DEFINITIONS.map((def) => {
              const progress = tracker.progressOf(def, engine.bodies, ctx);
              return {
                id: def.id,
                title: def.title,
                brief: def.brief,
                done: tracker.isComplete(def.id),
                progress: progress.progress,
              } satisfies ContractCardState;
            })
          );
        }

        // Approach autopilot (GAME12): auto-throttle near impact or periapsis.
        if (settingsRef.current.approachAutopilot && !engine.isPaused) {
          const imminent = forecastAlertsRef.current.some((a) => a.severity === 'imminent');
          let shouldSlow = imminent && engine.timeScale > 100;
          let reason = 'an imminent impact';
          if (!shouldSlow) {
            const sel = engine.bodies.find((b) => b.id === selectedBodyIdRef.current);
            if (sel) {
              const prim = engine.bodies.find((b) => b.id === sel.primaryId)
                ?? engine.bodies.find((b) => b.id !== sel.id && b.type === 'star');
              if (prim) {
                const els = getCachedElements(sel, prim, engine.timeSec);
                const anomaly = els?.trueAnomalyDeg ?? 180;
                const nearPeriapsis = (els?.eccentricity ?? 0) > 0.05 && (anomaly < 12 || anomaly > 348);
                if (nearPeriapsis && engine.timeScale > 1000) {
                  shouldSlow = true;
                  reason = `periapsis passage of ${sel.name}`;
                }
              }
            }
          }
          if (shouldSlow && !autopilotNotifiedRef.current) {
            autopilotNotifiedRef.current = true;
            prevTimeScaleRef.current = engine.timeScale;
            const target = imminent ? 100 : 1000;
            engine.timeScale = target;
            setTimeScale(target);
            timeScaleRef.current = target;
            toastRef.current.push({
              kind: 'info',
              title: 'Approach autopilot',
              detail: `Throttled to ${target}× near ${reason}.`,
              durationMs: 6000,
              action: {
                label: 'Resume pace',
                onSelect: () => {
                  if (engineRef.current) {
                    engineRef.current.timeScale = prevTimeScaleRef.current;
                    setTimeScale(prevTimeScaleRef.current);
                    timeScaleRef.current = prevTimeScaleRef.current;
                    autopilotNotifiedRef.current = false;
                  }
                },
              },
            });
          } else if (!shouldSlow) {
            autopilotNotifiedRef.current = false;
          }
        }

        // Soundscape follows time acceleration (ASSET06).
        if (settingsRef.current.audioEnabled) {
          audioSynth.setAmbienceIntensity(Math.min(1, Math.log10(Math.max(1, engine.timeScale)) / 5));
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
        case 'fork-branch': openForkModal(); break;
        case 'open-ledger': setIsLedgerOpen(true); break;
        case 'open-navigator': handleToggleNavigator(); break;
        case 'selection-back': selectionHistoryBack(); break;
        case 'selection-forward': selectionHistoryForward(); break;
        case 'open-missions': setMissionsVisible((v) => !v); break;
        case 'open-stats': setIsStatsOpen(true); break;
        case 'open-help': setIsHelpOpen(true); break;
        case 'command-palette': e.preventDefault(); setPaletteOpen(true); break;
        case 'present-capture': handlePresentCapture(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCreateModalOpen, isCanonLabOpen, isLedgerOpen, isCompareOpen, isForkOpen,
    isStatsOpen, isSettingsOpen, isHelpOpen, showOnboarding, confirmState, importError, pendingOrbit,
    paletteOpen,
  ]);

  // Iteration 3 (ASSET05): the deep-field backdrop follows the project name.
  useEffect(() => {
    sceneRef.current?.setNebulaSeed(SeededRng.hashString(projectName));
  }, [projectName]);

  // Command palette registration (UI01): static entries once, bodies/branches dynamic.
  useEffect(() => {
    const faster = () => {
      const next = TIME_LADDER.find((x) => x > timeScaleRef.current) ?? 100000;
      handleSetTimeScale(next);
    };
    const slower = () => {
      const below = [...TIME_LADDER].reverse().find((x) => x < timeScaleRef.current) ?? 1;
      handleSetTimeScale(below);
    };
    registerCommands([
      { id: 'cmd-pause', title: 'Pause / resume time', hint: shortcutHintFor('toggle-pause'), section: 'Transport', run: () => handleTogglePause() },
      { id: 'cmd-step', title: 'Step one tick', hint: shortcutHintFor('step-once'), section: 'Transport', run: () => handleStepOnce() },
      { id: 'cmd-faster', title: 'Accelerate time', hint: shortcutHintFor('faster'), section: 'Transport', run: faster },
      { id: 'cmd-slower', title: 'Decelerate time', hint: shortcutHintFor('slower'), section: 'Transport', run: slower },
      { id: 'cmd-resume-live', title: 'Resume live timeline', section: 'Transport', run: () => handleResumeLive() },
      { id: 'cmd-tool-select', title: 'Tool: Select', hint: shortcutHintFor('tool-select'), section: 'Tools', run: () => setActiveTool('select') },
      { id: 'cmd-tool-grab', title: 'Tool: Grab & throw', hint: shortcutHintFor('tool-grab'), section: 'Tools', run: () => setActiveTool('grab_throw') },
      { id: 'cmd-tool-loom', title: 'Tool: Orbit loom', hint: shortcutHintFor('tool-loom'), section: 'Tools', run: () => setActiveTool('orbit_loom') },
      { id: 'cmd-tool-create', title: 'New body…', hint: shortcutHintFor('tool-create'), section: 'Tools', run: () => setIsCreateModalOpen(true) },
      { id: 'cmd-preset-demo', title: 'Load preset: Demonstration', section: 'System', keywords: 'preset demo kallisto', run: () => handleLoadPreset('demo') },
      { id: 'cmd-preset-meridian', title: 'Load preset: Meridian study', section: 'System', keywords: 'preset meridian virgil', run: () => handleLoadPreset('meridian') },
      { id: 'cmd-preset-procedural', title: 'Load preset: Procedural system', section: 'System', keywords: 'preset procedural random seed', run: () => handleLoadPreset('procedural') },
      { id: 'cmd-preset-blank', title: 'Load preset: Blank system', section: 'System', keywords: 'preset blank empty', run: () => handleLoadPreset('blank') },
      { id: 'cmd-undo', title: 'Undo', hint: shortcutHintFor('undo'), section: 'System', run: () => handleUndo() },
      { id: 'cmd-export', title: 'Export system (.ssp.json)', section: 'System', run: () => handleExport() },
      { id: 'cmd-import', title: 'Import system…', section: 'System', run: () => handleImport() },
      { id: 'cmd-save-library', title: 'Shelve project in library', section: 'System', run: () => handleSaveToLibrary() },
      { id: 'cmd-capture', title: 'Capture frame (PNG)', hint: shortcutHintFor('present-capture'), section: 'System', run: () => handlePresentCapture() },
      { id: 'cmd-ledger', title: 'Open event ledger', hint: shortcutHintFor('open-ledger'), section: 'System', run: () => setIsLedgerOpen(true) },
      { id: 'cmd-compare', title: 'Compare branches', section: 'System', run: () => setIsCompareOpen(true) },
      { id: 'cmd-fork', title: 'Fork timeline…', hint: shortcutHintFor('fork-branch'), section: 'System', run: () => openForkModal() },
      { id: 'cmd-stats', title: 'System statistics', section: 'System', run: () => setIsStatsOpen(true) },
      { id: 'cmd-settings', title: 'Settings', section: 'System', run: () => setIsSettingsOpen(true) },
      { id: 'cmd-help', title: 'Keyboard shortcuts', hint: shortcutHintFor('open-help'), section: 'System', run: () => setIsHelpOpen(true) },
      { id: 'cmd-navigator', title: 'Toggle navigator', hint: shortcutHintFor('open-navigator'), section: 'System', run: () => handleToggleNavigator() },
      { id: 'cmd-missions', title: 'Toggle missions', hint: shortcutHintFor('open-missions'), section: 'System', run: () => setMissionsVisible((v) => !v) },
      { id: 'cmd-grid', title: 'Toggle gravity grid', hint: shortcutHintFor('toggle-grid'), section: 'System', run: () => handleToggleGravityGrid() },
      { id: 'cmd-hz', title: 'Toggle habitable zones', hint: shortcutHintFor('toggle-hz'), section: 'System', run: () => handleToggleHz() },
    ]);
    return () => {
      for (const id of [
        'cmd-pause', 'cmd-step', 'cmd-faster', 'cmd-slower', 'cmd-resume-live',
        'cmd-tool-select', 'cmd-tool-grab', 'cmd-tool-loom', 'cmd-tool-create',
        'cmd-preset-demo', 'cmd-preset-meridian', 'cmd-preset-procedural', 'cmd-preset-blank',
        'cmd-undo', 'cmd-export', 'cmd-import', 'cmd-save-library', 'cmd-capture',
        'cmd-ledger', 'cmd-compare', 'cmd-fork', 'cmd-stats', 'cmd-settings',
        'cmd-help', 'cmd-navigator', 'cmd-missions', 'cmd-grid', 'cmd-hz',
      ]) unregisterCommand(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic palette entries: every body (select + focus) and every branch.
  const censusKey = (engineRef.current?.bodies ?? []).map((b) => b.id).join(',');
  const branchKey = branches.map((b) => b.id).join(',');
  useEffect(() => {
    const bodies = engineRef.current?.bodies ?? [];
    const dynamicIds: string[] = [];
    registerCommands([
      ...bodies.flatMap((b) => {
        const sel = `cmd-body-${b.id}`;
        const foc = `cmd-focus-${b.id}`;
        dynamicIds.push(sel, foc);
        return [
          { id: sel, title: `Select ${b.name}`, section: 'Bodies' as const, keywords: `${b.name} ${b.type}`, run: () => handleSelectBody(b.id) },
          { id: foc, title: `Focus ${b.name}`, section: 'Bodies' as const, keywords: `${b.name} camera focus`, run: () => {
            handleSelectBody(b.id);
            if (sceneRef.current) sceneRef.current.viewMode = 'focus_selected';
          } },
        ];
      }),
      ...branches.flatMap((br) => {
        const id = `cmd-branch-${br.id}`;
        dynamicIds.push(id);
        return [{ id, title: `Switch to ${br.name}`, section: 'Branches' as const, keywords: `branch timeline ${br.name}`, run: () => handleSwitchBranch(br.id) }];
      }),
    ]);
    return () => { for (const id of dynamicIds) unregisterCommand(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [censusKey, branchKey]);

  // Controls & Action Handlers
  const handlePresentCapture = () => {
    if (!sceneRef.current) return;
    const url = sceneRef.current.captureScreenshot();
    if (!url) {
      toast.push({ kind: 'warning', title: 'Capture failed', detail: 'The canvas buffer was unavailable.' });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectNameRef.current.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Math.round(simTimeSec)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    audioSynth.playTick();
    const lastEclipse = lastEclipseRef.current;
    if (lastEclipse && mode === 'PRESENT' && Date.now() - lastEclipse.atMs <= 120000) {
      const bodies = engineRef.current?.bodies ?? [];
      if (bodies.some((b) => b.id === lastEclipse.viewerId) && bodies.some((b) => b.id === lastEclipse.occluderId)) {
        challengeTrackerRef.current?.credit('eclipse-photo');
      }
    }
    toast.push({ kind: 'success', title: 'Frame captured', detail: 'Screenshot exported as PNG.' });
  };

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
      const applied = engineRef.current.setTimeScale(scale);
      setTimeScale(applied);
      timeScaleRef.current = applied;
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
      sceneRef.current.setFollowBody(null);
      setFollowEnabled(false);
    } else {
      if (!selectedBodyIdRef.current) {
        toast.push({ kind: 'info', title: 'Nothing to follow', detail: 'Select a body first, then engage follow-camera.' });
        return;
      }
      sceneRef.current.viewMode = 'follow_selected';
      sceneRef.current.setFollowBody(selectedBodyIdRef.current);
      setFollowEnabled(true);
      setTopDownEnabled(false);
    }
    audioSynth.playTick();
  };

  // Exit any camera lock (iteration 3, UI08 camera pill).
  const handleExitCameraMode = (): void => {
    if (!sceneRef.current) return;
    sceneRef.current.setViewMode('inertial');
    sceneRef.current.setFollowBody(null);
    setFollowEnabled(false);
    setTopDownEnabled(false);
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
      const keepId = selectedBodyIdRef.current;
      branchManagerRef.current.switchBranch(id, engineRef.current);
      setActiveBranchId(id);
      setSystemStatus(engineRef.current.systemStatus);
      sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
      const survivor = keepId ? engineRef.current.bodies.find((b) => b.id === keepId) : undefined;
      if (survivor) {
        setSelectedBodyId(survivor.id);
        selectedBodyIdRef.current = survivor.id;
        sceneRef.current.setSelectedBody(survivor.id);
        toast.push({ kind: 'info', title: 'Selection preserved', detail: `${survivor.name} exists in this branch too.` });
      } else {
        setSelectedBodyId(null);
        selectedBodyIdRef.current = null;
        sceneRef.current.setSelectedBody(null);
      }
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
      id: createId(`tmpl-${tmpl.id}`),
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
      id: createId(`clone-${body.id}`),
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

  const afterManeuverSync = (label: string, bodyId?: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    if (bodyId) sceneRef.current.spawnBurnFlash(bodyId);
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
    undoStackRef.current?.checkpoint(engineRef.current, 'maneuver', `Nudge ${live.name}`);
    const result = applyNudge(live, primary, direction, dvKmS);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Maneuver rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: createId('nudge'),
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Maneuver: ${live.name}`,
      description: `${result.detail} relative to ${primary.name}.`,
      bodyIds: [live.id],
      severity: 'info',
    });
    afterManeuverSync(`${live.name}: ${result.detail}`, live.id);
  };

  const handleCircularize = (body: CelestialBody) => {
    const primary = resolvePrimary(body);
    if (!primary || !engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    undoStackRef.current?.checkpoint(engineRef.current, 'maneuver', `Circularize ${live.name}`);
    const result = circularizeOrbit(live, primary);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Circularization rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: createId('circ'),
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Circularized: ${live.name}`,
      description: result.detail,
      bodyIds: [live.id],
      severity: 'info',
    });
    eventBus.emit('orbit:circularized', { bodyId: live.id });
    afterManeuverSync(`${live.name}: ${result.detail}`, live.id);
  };

  const handleMatchVelocity = (body: CelestialBody, targetId: string) => {
    if (!engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    const target = engineRef.current.bodies.find((b) => b.id === targetId);
    if (!live || !target) return;
    undoStackRef.current?.checkpoint(engineRef.current, 'maneuver', `Rendezvous ${live.name}`);
    const result = matchVelocity(live, target);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Rendezvous rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: createId('rendez'),
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Rendezvous: ${live.name} → ${target.name}`,
      description: result.detail,
      bodyIds: [live.id, target.id],
      severity: 'info',
    });
    afterManeuverSync(result.detail, live.id);
  };

  // Hohmann transfer burn (GAME01): plan + apply departure impulse.
  const handleTransferBurn = (body: CelestialBody, targetRadiusKm: number) => {
    const primary = resolvePrimary(body);
    if (!primary || !engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    const plan = planHohmann(live, primary, targetRadiusKm);
    if (!plan) {
      toast.push({ kind: 'warning', title: 'Transfer rejected', detail: 'No valid Hohmann arc between these radii.' });
      return;
    }
    undoStackRef.current?.checkpoint(engineRef.current, 'maneuver', `Transfer ${live.name}`);
    const result = applyTransferDeparture(live, primary, plan);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Transfer rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: createId('transfer'),
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Transfer burn: ${live.name}`,
      description: `${result.detail} Coast ${formatCountdown(plan.transferTimeSec)} to intercept.`,
      bodyIds: [live.id, primary.id],
      severity: 'info',
    });
    eventBus.emit('transfer:executed', {
      bodyId: live.id,
      bodyName: live.name,
      detail: `Δv ${plan.totalDvKmS.toFixed(2)} km/s · coast ${formatCountdown(plan.transferTimeSec)}.`,
    });
    afterManeuverSync(`${live.name}: transfer departure Δv ${plan.dv1KmS.toFixed(2)} km/s`, live.id);
  };

  // Arrival burn at the destination (iteration 3, GAME03).
  const handleArrivalBurn = (body: CelestialBody, targetRadiusKm: number) => {
    const primary = resolvePrimary(body);
    if (!primary || !engineRef.current || !undoStackRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    const plan = planArrivalBurn(live, primary, targetRadiusKm);
    if (!plan) {
      toast.push({ kind: 'warning', title: 'Arrival rejected', detail: 'No valid arrival solution for this radius.' });
      return;
    }
    undoStackRef.current.checkpoint(engineRef.current, 'maneuver', `Arrival burn ${live.name}`);
    const result = applyArrivalBurn(live, primary, plan);
    if (!result.applied) {
      toast.push({ kind: 'warning', title: 'Arrival rejected', detail: result.detail });
      return;
    }
    engineRef.current.events.push({
      id: createId('arrival'),
      timestampSec: engineRef.current.timeSec,
      type: 'throw_released',
      title: `Arrival burn: ${live.name}`,
      description: result.detail,
      bodyIds: [live.id],
      severity: 'info',
    });
    eventBus.emit('orbit:circularized', { bodyId: live.id });
    afterManeuverSync(`${live.name}: ${result.detail}`, live.id);
  };

  // Trojan camp spawner (iteration 3, GAME11): honest L4/L5 co-orbital stations.
  const handleParkTrojans = (planet: CelestialBody) => {
    const primary = resolvePrimary(planet);
    if (!primary || !engineRef.current || !sceneRef.current || !undoStackRef.current) return;
    if (primary.type !== 'star') {
      toast.push({ kind: 'info', title: 'Trojans need a star', detail: 'Select a planet orbiting a star first.' });
      return;
    }
    const live = engineRef.current.bodies.find((b) => b.id === planet.id);
    if (!live) return;
    const pair = planTrojanPair(live, primary);
    if (!pair) {
      toast.push({ kind: 'warning', title: 'No trojan solution', detail: 'This planet has no usable L4/L5 geometry.' });
      return;
    }
    undoStackRef.current.checkpoint(engineRef.current, 'bulk', `Trojan pair ${live.name}`);
    const camps = [
      { label: 'L4', berth: pair.l4 },
      { label: 'L5', berth: pair.l5 },
    ];
    const spawned: string[] = [];
    for (const camp of camps) {
      const station: CelestialBody = {
        id: createId('trojan'),
        name: `${live.name} ${camp.label} Camp`,
        type: 'station',
        massKg: 1e9,
        radiusKm: 80,
        position: { ...camp.berth.position },
        velocity: { ...camp.berth.velocity },
        color: '#9fd8ff',
        primaryId: primary.id,
      };
      engineRef.current.addBody(station);
      spawned.push(station.id);
    }
    engineRef.current.events.push({
      id: createId('trojan'),
      timestampSec: engineRef.current.timeSec,
      type: 'body_created',
      title: `Trojan pair parked at ${live.name}`,
      description: `Co-orbital stations hold the L4/L5 camps of ${live.name} around ${primary.name}.`,
      bodyIds: spawned,
      severity: 'info',
    });
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    setEventCount(engineRef.current.events.length);
    setSigilSvg(generateSystemSigilSvg(projectNameRef.current, engineRef.current.bodies));
    audioSynth.playOrbitLock();
    toast.push({ kind: 'success', title: 'Trojan pair parked', detail: `L4/L5 camps established around ${live.name}.` });
  };

  // Forecast interventions (iteration 3, GAME08): track or stabilize the doomed.
  const handleTrackAlert = (alert: ForecastAlert) => {
    handleSelectBody(alert.bodyAId);
    if (sceneRef.current && !followEnabled) {
      sceneRef.current.viewMode = 'follow_selected';
      sceneRef.current.setFollowBody(alert.bodyAId);
      setFollowEnabled(true);
      setTopDownEnabled(false);
    }
  };

  const handleStabilizeAlert = (alert: ForecastAlert) => {
    const body = engineRef.current?.bodies.find((b) => b.id === alert.bodyAId);
    if (!body) {
      toast.push({ kind: 'info', title: 'Pair unavailable', detail: 'The threatened body is gone.' });
      return;
    }
    handleCircularize(body);
  };

  // Forecast-driven manual merge (GAME10): fuse a doomed pair on demand.
  const handleMergeAlert = (alert: ForecastAlert) => {
    if (!engineRef.current || !sceneRef.current) return;
    const a = engineRef.current.bodies.find((b) => b.id === alert.bodyAId);
    const b = engineRef.current.bodies.find((b) => b.id === alert.bodyBId);
    if (!a || !b) {
      toast.push({ kind: 'info', title: 'Pair unavailable', detail: 'One of the forecast bodies is gone.' });
      return;
    }
    undoStackRef.current?.checkpoint(engineRef.current, 'merge', `Merge ${a.name} + ${b.name}`);
    const result = mergeBodiesInelastic(a, b, engineRef.current.timeSec);
    const idx = engineRef.current.bodies.findIndex((x) => x.id === result.survivor.id);
    if (idx !== -1) engineRef.current.bodies[idx] = result.survivor;
    engineRef.current.removeBody(result.absorbedId);
    engineRef.current.events.push(result.event);
    if (selectedBodyIdRef.current === result.absorbedId) handleSelectBody(result.survivor.id);
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    sceneRef.current.spawnCollisionBurstAtBody(result.survivor.id, '#c084fc', 1.6);
    setEventCount(engineRef.current.events.length);
    setForecastAlerts((prev) => prev.filter((x) => x.key !== alert.key));
    eventBus.emit('merge:executed', {
      survivorId: result.survivor.id,
      survivorName: result.survivor.name,
      detail: `${a.name} + ${b.name} fused at ${result.relativeSpeedKmS.toFixed(1)} km/s relative.`,
    });
    toast.push({
      kind: 'warning',
      title: `Merged: ${result.survivor.name}`,
      detail: 'Forecast pair fused deliberately. Undo restores both bodies.',
      action: { label: 'Undo', onSelect: () => handleUndo() },
    });
  };

  // Station-keeping toggle (GAME11): stations hold their circular orbit.
  const handleToggleStationKeeping = (body: CelestialBody) => {
    if (!engineRef.current || !sceneRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    live.stationKeeping = !live.stationKeeping;
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    setFrameCount((f) => f + 1);
    audioSynth.playTick();
    toast.push({
      kind: 'info',
      title: live.stationKeeping ? `Station-keeping on: ${live.name}` : `Station-keeping off: ${live.name}`,
      detail: live.stationKeeping ? 'Thrusters will null orbital decay each tick.' : 'The station now drifts on pure ballistics.',
    });
  };

  // Ephemeris export (BACK12): 720-sample CSV for the selected body.
  const handleExportEphemeris = (body: CelestialBody) => {
    if (!engineRef.current) return;
    const live = engineRef.current.bodies.find((b) => b.id === body.id);
    if (!live) return;
    const samples = sampleEphemeris([live], 720, 3600);
    const csv = ephemerisToCsv(samples);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${live.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ephemeris.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    audioSynth.playTick();
    toast.push({ kind: 'success', title: `Ephemeris exported: ${live.name}`, detail: '721 samples · hourly · 30 days.' });
    eventBus.emit('ephemeris:exported', { bodyId: live.id });
  };

  // Time-scrub rewind (UI03): restore a buffered snapshot, pausing live time.
  const handleScrub = (index: number) => {
    const buf = snapshotBufferRef.current;
    if (!buf || !engineRef.current || !sceneRef.current) return;
    const snap = buf.at(index);
    if (!snap) return;
    if (scrubIndex === null) {
      undoStackRef.current?.checkpoint(engineRef.current, 'time-scrub', 'Scrub history');
      engineRef.current.isPaused = true;
      setIsPaused(true);
      isPausedRef.current = true;
    }
    engineRef.current.restoreSnapshot({
      timestampSec: snap.timeSec,
      bodies: snap.bodies,
      belts: engineRef.current.belts,
      hookshotRoutes: engineRef.current.hookshotRoutes,
    });
    sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
    monitorRef.current?.reset();
    setSimTimeSec(engineRef.current.timeSec);
    setScrubIndex(index);
    if (showFutureRef.current && futureClientRef.current) {
      futureClientRef.current.requestForecast(engineRef.current.bodies, {
        selectedBodyId: selectedBodyIdRef.current,
        calculateSensitivity: showSensitivityRef.current,
      });
    }
  };

  const handleResumeLive = () => {
    if (!engineRef.current) return;
    engineRef.current.isPaused = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setScrubIndex(null);
    monitorRef.current?.reset();
    toast.push({
      kind: 'info',
      title: 'Live timeline resumed',
      detail: 'History was rewritten from the scrub point. Undo restores the frontier.',
    });
  };

  // Bookmark toggle (UI02): persisted in settings, surfaced in the navigator.
  const handleToggleBookmark = (id: string) => {
    const next = settings.bookmarkedBodyIds.includes(id)
      ? settings.bookmarkedBodyIds.filter((x) => x !== id)
      : [...settings.bookmarkedBodyIds, id];
    setSettings(settingsStore.update({ bookmarkedBodyIds: next }));
    audioSynth.playTick();
  };

  // Project library (BACK03): named slots beyond the autosave.
  const handleSaveToLibrary = () => {
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
      createId('lib')
    );
    void saveToLibrary(project)
      .then(() => listLibrary())
      .then((entries) => {
        setLibraryEntries(entries);
        eventBus.emit('library:saved', { projectId: project.projectId, name: project.projectName });
        toast.push({ kind: 'success', title: 'Saved to library', detail: `“${project.projectName}” shelved.` });
      })
      .catch((err) => {
        toast.push({ kind: 'error', title: 'Library save failed', detail: toUserMessage(err) });
      });
  };

  const handleOpenProject = (projectId: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    void loadFromLibrary(projectId)
      .then((project) => {
        if (!project || !engineRef.current || !sceneRef.current) {
          toast.push({ kind: 'warning', title: 'Project missing', detail: 'That library entry no longer exists.' });
          return;
        }
        undoStackRef.current?.checkpoint(engineRef.current, 'bulk', `Open ${project.projectName}`);
        const active = project.branches.find((b) => b.id === project.activeBranchId) ?? project.branches[0];
        engineRef.current.restoreSnapshot(active.snapshot);
        engineRef.current.events = [...active.events];
        engineRef.current.systemStatus = project.systemStatus ?? 'active';
        setSystemStatus(engineRef.current.systemStatus);
        const bMgr = BranchManager.fromPersisted(project.branches, project.activeBranchId);
        branchManagerRef.current = bMgr;
        setBranches(bMgr.getAllBranches());
        setActiveBranchId(bMgr.activeBranchId);
        setProjectName(project.projectName);
        sceneRef.current.syncBodies(engineRef.current.bodies, engineRef.current.belts);
        setSelectedBodyId(null);
        selectedBodyIdRef.current = null;
        sceneRef.current.setSelectedBody(null);
        monitorRef.current?.reset();
        setSigilSvg(generateSystemSigilSvg(project.projectName, engineRef.current.bodies));
        eventBus.emit('project:loaded', { preset: 'library', name: project.projectName });
        audioSynth.playTick();
        toast.push({ kind: 'success', title: `Opened ${project.projectName}`, detail: 'Library project loaded.' });
      })
      .catch((err) => {
        toast.push({ kind: 'error', title: 'Library open failed', detail: toUserMessage(err) });
      });
  };

  const handleDeleteProject = (projectId: string) => {
    const entry = libraryEntries.find((e) => e.projectId === projectId);
    setConfirmState({
      title: `Remove “${entry?.projectName ?? projectId}”?`,
      message: 'The library entry is deleted permanently. Export first if this system matters.',
      confirmLabel: 'Delete Entry',
      onConfirm: () => {
        setConfirmState(null);
        void deleteFromLibrary(projectId)
          .then(() => listLibrary())
          .then((entries) => {
            setLibraryEntries(entries);
            toast.push({ kind: 'info', title: 'Library entry removed', detail: entry?.projectName ?? projectId });
          })
          .catch((err) => {
            toast.push({ kind: 'error', title: 'Library delete failed', detail: toUserMessage(err) });
          });
      },
    });
  };

  const handleResetContracts = () => {
    contractTrackerRef.current?.resetAll();
    setContractCards([]);
    toast.push({ kind: 'info', title: 'Contracts reset', detail: 'All scenario commissions are available again.' });
  };

  const openForkModal = () => {
    setIsForkOpen(true);
    if (shouldShowCoachmark('fork')) setCoachmark({ id: 'fork', anchor: 'timeline' });
  };

  const openCanonLab = () => {
    setIsCanonLabOpen(true);
    if (shouldShowCoachmark('macro')) setCoachmark({ id: 'macro', anchor: 'center' });
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
      createId('proj')
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
          const diag = parseProjectWithDiagnostics(raw);
          if (!diag.ok || !diag.project) {
            logger.error('import', 'Project import failed validation', { issues: diag.issues.length });
            setImportDiagnostics({ fileName: file.name, issues: diag.issues, notes: diag.migrationNotes });
            return;
          }
          const { project, migrated, migrationNotes } = { project: diag.project, migrated: diag.migrated, migrationNotes: diag.migrationNotes };
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
    importError !== null || importDiagnostics !== null || paletteOpen;

  // Timeline divergence tags (GAME14): live bodies for the active branch.
  const primeBranch = branches.find((b) => b.parentBranchId === null) ?? branches[0];
  const divergenceByBranch: Record<string, number> = {};
  if (primeBranch) {
    const bodiesFor = (id: string) =>
      id === activeBranchId ? (engineRef.current?.bodies ?? []) : (branches.find((b) => b.id === id)?.snapshot.bodies ?? []);
    for (const br of branches) {
      divergenceByBranch[br.id] = br.id === primeBranch.id ? 0 : divergencePercent(bodiesFor(primeBranch.id), bodiesFor(br.id));
    }
  }

  // Iteration 3: progression props memoized on their refresh ticks.
  const debriefProps = useMemo(
    () =>
      assistTrackerRef.current
        ? {
            best: assistTrackerRef.current.best,
            recent: assistTrackerRef.current.recentAssists(),
            onReset: () => {
              assistTrackerRef.current?.reset();
              setAssistVersion((v) => v + 1);
            },
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistVersion]
  );
  const codexProps = useMemo(
    () => ({
      entries: discoveryCodex.list(),
      onReset: () => {
        discoveryCodex.reset();
        setCodexVersion((v) => v + 1);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codexVersion]
  );

  const downloadDiagnostics = () => {
    const blob = new Blob(
      [
        logger.exportDiagnostics(
          collectDiagnostics({
            capabilities,
            projectName,
            simTimeSec,
            settingsVersion: settings.settingsVersion,
            branchCount: branches.length,
            activeBranchId,
            eventCount: engineRef.current?.events.length ?? 0,
            disposal: disposalRegistry.report(),
            forecastCache: futureClientRef.current?.getCacheStats() ?? null,
            forecastHealth: futureClientRef.current?.getHealth() ?? null,
            monitorLoad: monitorRef.current?.getLoadStats() ?? null,
          })
        ),
      ],
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
    <div className={`planner-viewport${settings.hudDensity === 'compact' ? ' hud-compact' : ''}`}>

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
        <WarpStreaks timeScale={timeScale} paused={isPaused} reducedMotion={settings.reducedMotion} />
        {mode !== 'PRESENT' && (
        <PanelErrorBoundary panel="Command bar">
        <TopBar
          projectName={projectName}
          sigilSvg={sigilSvg}
          systemStatus={systemStatus}
          mode={mode}
          onSetMode={(m) => {
            setMode(m);
            if (m === 'CANON LAB') openCanonLab();
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
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenLedger={() => setIsLedgerOpen(true)}
          health={health}
          library={libraryEntries}
          onSaveToLibrary={handleSaveToLibrary}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
        />
        </PanelErrorBoundary>
        )}
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
            <button
              className="forecast-merge"
              onClick={() => handleMergeAlert(forecastAlerts[0])}
              title="Fuse this pair now (undoable)"
            >
              MERGE NOW
            </button>
            <button
              className="forecast-track"
              onClick={() => handleTrackAlert(forecastAlerts[0])}
              title="Follow the threatened body"
            >
              TRACK
            </button>
            <button
              className="forecast-stabilize"
              onClick={() => handleStabilizeAlert(forecastAlerts[0])}
              title="Circularize the threatened body (undoable)"
            >
              STABILIZE
            </button>
          </div>
        )}

        {/* Center Canvas Area (Tap void handled by pointer-manager) */}
        <div style={{ flex: 1, pointerEvents: 'none' }} />

        {/* Contextual HUD hint (onboarding support) */}
        {settings.showHudHints && !selectedBody && !anyModalOpen && booted && mode !== 'PRESENT' && (
          <div className="hud-hint hud-interactive">
            Tap a world to inspect · <b>2</b> grab · <b>3</b> loom · <b>?</b> shortcuts
          </div>
        )}

        {/* Selected Body Inspector */}
        {selectedBody && mode !== 'PRESENT' && (
          <PanelErrorBoundary panel="Inspector">
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
            onOpenCanonMacro={openCanonLab}
            onCloneBody={handleCloneBody}
            onNudge={handleNudge}
            onCircularize={handleCircularize}
            onMatchVelocity={handleMatchVelocity}
            onTransferBurn={handleTransferBurn}
            onArrivalBurn={handleArrivalBurn}
            onParkTrojans={handleParkTrojans}
            onToggleStationKeeping={handleToggleStationKeeping}
            onExportEphemeris={handleExportEphemeris}
            unitSystem={settings.unitSystem}
          />
          </PanelErrorBoundary>
        )}

        {/* Selection breadcrumb chip (UI14) */}
        {selectedBody && !anyModalOpen && mode !== 'PRESENT' && (
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
            bookmarked={settings.bookmarkedBodyIds.includes(selectedBody.id)}
            onToggleBookmark={() => handleToggleBookmark(selectedBody.id)}
            onBack={selectionHistoryBack}
            onForward={selectionHistoryForward}
            canBack={historyPos.index > 0}
            canForward={historyPos.index >= 0 && historyPos.index < historyPos.length - 1}
          />
        )}

        {/* Bottom Timeline Bar */}
        {mode !== 'PRESENT' && (
        <PanelErrorBoundary panel="Timeline">
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
          cameraMode={topDownEnabled ? 'top' : followEnabled ? 'follow' : sceneRef.current?.viewMode === 'focus_selected' ? 'focus' : 'inertial'}
          cameraTargetName={selectedBody?.name ?? null}
          onExitCameraMode={handleExitCameraMode}
          onSwitchBranch={handleSwitchBranch}
          onForkBranch={openForkModal}
          onOpenLedger={() => setIsLedgerOpen(true)}
          onOpenBranchCompare={() => setIsCompareOpen(true)}
          eventCount={eventCount}
          divergenceByBranch={divergenceByBranch}
          scrub={{
            size: scrubCount,
            index: scrubIndex ?? Math.max(0, scrubCount - 1),
            oldestTimeSec: snapshotBufferRef.current?.oldestTimeSec() ?? null,
            newestTimeSec: snapshotBufferRef.current?.newestTimeSec() ?? null,
            scrubbing: scrubIndex !== null,
            onScrub: handleScrub,
            onResumeLive: handleResumeLive,
          }}
        />
        </PanelErrorBoundary>
        )}
      </div>

      {/* Left Vertical Tool Rail */}
      {mode !== 'PRESENT' && (
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
        onOpenCanonLab={openCanonLab}
        onResetCamera={() => {
          if (sceneRef.current) {
            sceneRef.current.viewMode = 'inertial';
            sceneRef.current.cameraTarget.set(0, 0, 0);
            setFollowEnabled(false);
            setTopDownEnabled(false);
          }
        }}
      />
      )}

      {/* Present-mode overlay (UI15): chrome-free canvas + capture. */}
      {mode === 'PRESENT' && (
        <div className="present-overlay hud-interactive">
          <div className="present-title">{projectName}</div>
          <div className="present-meta">
            {isPaused ? 'HELD' : `${timeScale.toLocaleString()}×`} · T+{formatSimTime(simTimeSec)} ·{' '}
            {branches.find((b) => b.id === activeBranchId)?.name ?? 'Prime Timeline'}
          </div>
          <div className="present-row">
            <button className="present-btn ghost" onClick={handleTogglePause} title="Pause / resume (Space)">
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="present-btn ghost" onClick={handleStepOnce} title="Advance one step (.)">
              Step
            </button>
            <button
              className="present-btn ghost"
              onClick={() => {
                const below = [...TIME_LADDER].reverse().find((x) => x < timeScaleRef.current) ?? 1;
                handleSetTimeScale(below);
              }}
              title="Slow down"
            >
              −
            </button>
            <button
              className="present-btn ghost"
              onClick={() => {
                const next = TIME_LADDER.find((x) => x > timeScaleRef.current) ?? 100000;
                handleSetTimeScale(next);
              }}
              title="Speed up"
            >
              +
            </button>
            <button className="present-btn" onClick={handlePresentCapture} title="Export the current frame as PNG (P)">
              Capture PNG
            </button>
            <button className="present-btn ghost" onClick={() => setMode('SIMULATE')} title="Return to the full HUD">
              Exit present
            </button>
          </div>
        </div>
      )}

      {/* System navigator (UI07) */}
      {navigatorVisible && booted && mode !== 'PRESENT' && (
        <PanelErrorBoundary panel="System navigator">
        <SystemNavigator
          bodies={engineRef.current?.bodies || []}
          selectedBodyId={selectedBodyId}
          onSelectBody={handleSelectBody}
          onFocusBody={(id) => {
            handleSelectBody(id);
            if (sceneRef.current) sceneRef.current.viewMode = 'focus_selected';
          }}
          onClose={handleToggleNavigator}
          bookmarkedIds={settings.bookmarkedBodyIds}
          onToggleBookmark={handleToggleBookmark}
        />
        </PanelErrorBoundary>
      )}

      {/* Missions panel (GAME14) */}
      {missionsVisible && mode !== 'PRESENT' && (
        <PanelErrorBoundary panel="Missions">
        <MissionsPanel
          definitions={CHALLENGE_DEFINITIONS}
          states={challenges}
          onClose={() => setMissionsVisible(false)}
          onReset={() => challengeTrackerRef.current?.resetAll()}
          contracts={contractCards}
          onResetContracts={handleResetContracts}
          debrief={debriefProps}
          codex={codexProps}
        />
        </PanelErrorBoundary>
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
                  id: createId('loom'),
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
                  id: createId('ring'),
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

      {importDiagnostics && (
        <ImportDiagnosticsDialog
          fileName={importDiagnostics.fileName}
          issues={importDiagnostics.issues}
          migrationNotes={importDiagnostics.notes}
          onClose={() => setImportDiagnostics(null)}
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
        <PanelErrorBoundary panel="Event ledger">
        <EventLedgerModal
          events={engineRef.current?.events || []}
          onClose={() => setIsLedgerOpen(false)}
          onFocusBody={(id) => {
            setIsLedgerOpen(false);
            handleSelectBody(id);
            if (sceneRef.current) sceneRef.current.viewMode = 'focus_selected';
          }}
        />
        </PanelErrorBoundary>
      )}

      {isCompareOpen && branchManagerRef.current && (
        <BranchCompareModal
          branches={branches}
          branchManager={branchManagerRef.current}
          onClose={() => setIsCompareOpen(false)}
        />
      )}

      {isStatsOpen && (
        <PanelErrorBoundary panel="System statistics">
        <SystemStatsModal
          bodies={engineRef.current?.bodies || []}
          simTimeSec={simTimeSec}
          eventCount={eventCount}
          architect={(() => {
            const stats = computeSystemStatistics(engineRef.current?.bodies ?? []);
            return computeArchitectScore({
              missionsDone: challenges.filter((c) => c.completed).length,
              missionsTotal: CHALLENGE_DEFINITIONS.length,
              contractsDone: contractTrackerRef.current?.completedIds().length ?? 0,
              contractsTotal: CONTRACT_DEFINITIONS.length,
              codexKinds: discoveryCodex.kindsSeen(),
              codexSightings: discoveryCodex.totalSightings(),
              stabilityScore: stats.stabilityScore,
            });
          })()}
          onClose={() => setIsStatsOpen(false)}
        />
        </PanelErrorBoundary>
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

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {coachmark && !paletteOpen && (
        <Coachmark
          id={coachmark.id}
          anchor={coachmark.anchor}
          onDismiss={(id) => {
            dismissCoachmark(id);
            setCoachmark(null);
          }}
        />
      )}
      <Announcer />
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <PlannerApp />
  </ToastProvider>
);

export default App;
