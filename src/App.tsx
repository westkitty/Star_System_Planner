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
import { generateSystemSigilSvg } from './persistence/sigil';
import { saveProjectToDb, loadProjectFromDb } from './persistence/db';
import { downloadProjectFile, parseAndValidateProjectJson } from './persistence/export-import';
import { createSerializableProject } from './persistence/serializer';
import { audioSynth } from './audio/audio-synth';
import { CanonMacro } from './canon/macros';
import { resolvePointerIntent } from './interaction/pointer-intent';

// UI Components
import { TopBar, AppMode } from './ui/TopBar';
import { ToolRail } from './ui/ToolRail';
import { ContextInspector } from './ui/ContextInspector';
import { TimelineBar } from './ui/TimelineBar';
import { CanonLabModal } from './ui/CanonLabModal';
import { CreateBodyModal } from './ui/CreateBodyModal';
import { EventLedgerModal } from './ui/EventLedgerModal';
import { BranchCompareModal } from './ui/BranchCompareModal';
import { OrbitLoomConfirmModal } from './ui/OrbitLoomConfirmModal';

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

  // UI State
  const [projectName, setProjectName] = useState('Kallisto Demonstration System');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('active');
  const [mode, setMode] = useState<AppMode>('SIMULATE');
  const [activeTool, setActiveTool] = useState<PointerToolMode>('select');
  const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('readable');
  const [collisionsEnabled, setCollisionsEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [gravityGridVisible, setGravityGridVisible] = useState(false);
  const [showFuture, setShowFuture] = useState(true);
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);
  const [simTimeSec, setSimTimeSec] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [sigilSvg, setSigilSvg] = useState('');

  // Orbit Loom pending fitted orbit
  const [pendingOrbit, setPendingOrbit] = useState<FittedOrbit | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCanonLabOpen, setIsCanonLabOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  // Timeline Branches
  const [branches, setBranches] = useState<any[]>([]);
  const [activeBranchId, setActiveBranchId] = useState('branch-prime');

  // Trigger helper for state sync
  const [, setFrameCount] = useState(0);

  // === STABLE STATE BRIDGE REFS ===
  // Long-lived persistent callbacks query current state through these refs
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
  }, [showFuture, showSensitivity]);

  // Initialize System
  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Initialize SceneManager
    const sceneMgr = new SceneManager(canvasRef.current);
    sceneRef.current = sceneMgr;

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

    // 4. Initialize Grab & Throw
    const grabThrow = new GrabAndThrowController(sceneMgr, {
      onVelocityChanged: (body, _vel) => {
        // Trigger future prediction on drag using fresh state refs
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
      // Sync predicted paths to trajectory renderer with fresh selectedBodyId check
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
          // Ensure appropriate primary is set
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
            setSelectedBodyId(hitBodyId);
            selectedBodyIdRef.current = hitBodyId;
            sceneMgr.setSelectedBody(hitBodyId);
          }
          return;
        }

        if (intent === 'deselect') {
          setSelectedBodyId(null);
          selectedBodyIdRef.current = null;
          sceneMgr.setSelectedBody(null);
          return;
        }

        // intent === 'camera_navigate'
        // Ordinary camera navigation: drawing/manipulation flags remain false
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

        // Ordinary background drag orbits camera using per-pointer delta tracking
        if (e.rawEvent.buttons === 1 || e.pointerType === 'touch') {
          sceneMgr.orbitCamera(-e.deltaX * 0.006, -e.deltaY * 0.006);
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
    sceneMgr.syncBodies(engine.bodies);

    // === STARTUP RESTORE FROM INDEXEDDB ===
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
            setSystemStatus(engineRef.current.systemStatus);
            setScaleMode(saved.visualSettings?.scaleMode || 'readable');
            sceneRef.current.scaleTransform.setMode(saved.visualSettings?.scaleMode || 'readable');
            setShowFuture(saved.visualSettings?.showFuture ?? true);
            setShowSensitivity(saved.visualSettings?.showSensitivity ?? false);
            setGravityGridVisible(saved.visualSettings?.showGravityGrid ?? false);
            sceneRef.current.gravityGrid.getMesh().visible = saved.visualSettings?.showGravityGrid ?? false;
            setCollisionsEnabled(saved.simulationSettings?.enableCollisions ?? true);
            setTimeScale(saved.simulationSettings?.timeScale ?? 1.0);
            sceneRef.current.syncBodies(engineRef.current.bodies);
            setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
          }
        }
      })
      .catch((err) => {
        console.warn('Startup restore skipped; proceeding with demonstration system:', err);
      });

    // 8. Master Animation Loop (requestAnimationFrame)
    let animationFrameId: number;
    let lastTime = performance.now();
    let frameTicker = 0;

    const tick = (now: number) => {
      const deltaSec = (now - lastTime) / 1000.0;
      lastTime = now;

      // Update simulation physics
      engine.update(deltaSec);

      // Sync positions to 3D scene
      sceneMgr.syncBodies(engine.bodies);
      sceneMgr.update(deltaSec);
      sceneMgr.render();

      // Periodic state sync to React (every ~10 frames)
      frameTicker++;
      if (frameTicker % 10 === 0) {
        setSimTimeSec(engine.timeSec);
        setEventCount(engine.events.length);
        setSystemStatus(engine.systemStatus);
        setFrameCount(f => f + 1);

        // Periodic future forecast update
        if (showFutureRef.current && futureClientRef.current && !engine.isPaused) {
          futureClientRef.current.requestForecast(engine.bodies, {
            selectedBodyId: sceneMgr.selectedBodyId,
            calculateSensitivity: showSensitivityRef.current,
          });
        }

        // Periodic debounced autosave with authoritative active branch checkpointing (~5s)
        if (frameTicker % 300 === 0 && branchManagerRef.current && engineRef.current && sceneRef.current) {
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
            'system-autosave'
          );
          saveProjectToDb(autoSaveProject).catch(() => {});
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    // Window resize handler
    const handleResize = () => {
      if (canvasRef.current) {
        sceneMgr.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      pointerMgr.destroy();
      futureClient.destroy();
    };
  }, []);

  // Controls & Action Handlers
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

  const handleToggleAudio = () => {
    const next = !audioEnabled;
    audioSynth.isEnabled = next;
    setAudioEnabled(next);
    if (next) audioSynth.playTick();
  };

  // Branching: Fork Branch
  const handleForkBranch = () => {
    if (branchManagerRef.current && engineRef.current) {
      const name = prompt('Enter name for the new causal branch:', `Branch @ ${Math.round(engineRef.current.timeSec)}s`);
      if (name) {
        const newBranch = branchManagerRef.current.forkBranch(name, engineRef.current);
        setBranches(branchManagerRef.current.getAllBranches());
        setActiveBranchId(newBranch.id);
        audioSynth.playTick();
      }
    }
  };

  // Branching: Switch Branch
  const handleSwitchBranch = (id: string) => {
    if (branchManagerRef.current && engineRef.current && sceneRef.current) {
      branchManagerRef.current.switchBranch(id, engineRef.current);
      setActiveBranchId(id);
      setSystemStatus(engineRef.current.systemStatus);
      sceneRef.current.syncBodies(engineRef.current.bodies);
      setSelectedBodyId(null);
      selectedBodyIdRef.current = null;
      sceneRef.current.setSelectedBody(null);
      audioSynth.playTick();
    }
  };

  // Load Presets
  const handleLoadPreset = (presetType: 'demo' | 'meridian' | 'blank') => {
    if (!engineRef.current || !sceneRef.current) return;

    let preset: { bodies: CelestialBody[]; belts?: any[] };
    let pName = '';

    if (presetType === 'demo') {
      preset = createDemonstrationSystem();
      pName = 'Kallisto Demonstration System';
    } else if (presetType === 'meridian') {
      preset = createMeridianPreset();
      pName = 'Virgil & Meridian Reference Study';
    } else {
      preset = createBlankSystem();
      pName = 'Blank System';
    }

    engineRef.current.bodies = preset.bodies;
    engineRef.current.belts = preset.belts || [];
    engineRef.current.timeSec = 0;
    engineRef.current.systemStatus = 'active';
    engineRef.current.events = [];
    setSystemStatus('active');

    // Reset Branch Manager
    const bMgr = new BranchManager(engineRef.current, 'Prime Timeline');
    branchManagerRef.current = bMgr;
    setBranches(bMgr.getAllBranches());
    setActiveBranchId(bMgr.activeBranchId);

    // Update scene
    sceneRef.current.syncBodies(engineRef.current.bodies);
    setSelectedBodyId(null);
    selectedBodyIdRef.current = null;
    sceneRef.current.setSelectedBody(null);

    setProjectName(pName);
    setSigilSvg(generateSystemSigilSvg(pName, engineRef.current.bodies));
    audioSynth.playTick();
  };

  // Execute Canon Macro
  const handleExecuteMacro = (macro: CanonMacro, targetId?: string) => {
    if (!engineRef.current || !sceneRef.current) return;
    const ev = macro.apply(engineRef.current, targetId);
    if (ev) {
      if (macro.id === 'pull-starsilk' || macro.id === 'starbinding-study') {
        audioSynth.playStarCollapse();
      } else {
        audioSynth.playTick();
      }
      setSystemStatus(engineRef.current.systemStatus);
      // Checkpoint active branch immediately after macro consequence
      branchManagerRef.current?.checkpointActiveBranch(engineRef.current);
      sceneRef.current.syncBodies(engineRef.current.bodies);
      setEventCount(engineRef.current.events.length);
      setIsCanonLabOpen(false);
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
    sceneRef.current.syncBodies(engineRef.current.bodies);
    setSelectedBodyId(newWorld.id);
    selectedBodyIdRef.current = newWorld.id;
    sceneRef.current.setSelectedBody(newWorld.id);
    audioSynth.playTick();
  };

  // Export / Import
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
          const project = parseAndValidateProjectJson(raw);
          if (engineRef.current && sceneRef.current) {
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
            sceneRef.current.syncBodies(engineRef.current.bodies);
            setSigilSvg(generateSystemSigilSvg(project.projectName, engineRef.current.bodies));
            audioSynth.playTick();
          }
        } catch (err: any) {
          alert(`Failed to import system file: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const selectedBody = engineRef.current?.bodies.find(b => b.id === selectedBodyId) || null;

  return (
    <div className="planner-viewport">
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
          onExport={handleExport}
          onImport={handleImport}
          onLoadPreset={handleLoadPreset}
        />

        {/* Center Canvas Area (Tap void handled by pointer-manager) */}
        <div style={{ flex: 1, pointerEvents: 'none' }} />

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
                  sceneRef.current.syncBodies(engineRef.current.bodies);
                  setFrameCount(f => f + 1);
                }
              }
            }}
            onDeleteBody={(id) => {
              if (engineRef.current && sceneRef.current) {
                engineRef.current.removeBody(id);
                sceneRef.current.syncBodies(engineRef.current.bodies);
                setSelectedBodyId(null);
                selectedBodyIdRef.current = null;
                sceneRef.current.setSelectedBody(null);
                audioSynth.playTick();
              }
            }}
            onFocusBody={(_id) => {
              if (sceneRef.current) {
                sceneRef.current.viewMode = 'focus_selected';
              }
            }}
            onStartGrabThrow={(body) => {
              setActiveTool('grab_throw');
              grabThrowRef.current?.startGrab(body);
            }}
            onOpenCanonMacro={(_macroId) => {
              setIsCanonLabOpen(true);
            }}
          />
        )}

        {/* Bottom Timeline Bar */}
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
          }
        }}
      />

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
                sceneRef.current.syncBodies(engineRef.current.bodies);
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
                sceneRef.current.syncBodies(engineRef.current.bodies);
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
    </div>
  );
};
export default App;
