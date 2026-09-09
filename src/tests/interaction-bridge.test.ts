import { describe, it, expect, vi } from 'vitest';
import { PointerManager } from '../interaction/pointer-manager';
import { OrbitLoom } from '../interaction/orbit-loom';
import { resolvePointerIntent } from '../interaction/pointer-intent';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';

describe('Authoritative Pointer Intent & Modality Routing', () => {
  it('TEST A: ORBIT LOOM + touch does not start Orbit Loom drawing', () => {
    const intent = resolvePointerIntent({
      tool: 'orbit_loom',
      pointerType: 'touch',
      hasHitBody: false,
    });
    expect(intent).toBe('camera_navigate');
    expect(intent).not.toBe('orbit_loom_draw');
  });

  it('TEST B: ORBIT LOOM + pen does start Orbit Loom drawing', () => {
    const intent = resolvePointerIntent({
      tool: 'orbit_loom',
      pointerType: 'pen',
      hasHitBody: false,
    });
    expect(intent).toBe('orbit_loom_draw');
  });

  it('TEST C: ORBIT LOOM + mouse continues to work as desktop fallback', () => {
    const intent = resolvePointerIntent({
      tool: 'orbit_loom',
      pointerType: 'mouse',
      hasHitBody: false,
    });
    expect(intent).toBe('orbit_loom_draw');
  });

  it('TEST D: ORBIT LOOM + two touch pointers routes strictly to camera navigation', () => {
    const intent = resolvePointerIntent({
      tool: 'orbit_loom',
      pointerType: 'touch',
      hasHitBody: false,
      pointerCount: 2,
    });
    expect(intent).toBe('camera_navigate');
  });

  it('TEST F: Touch navigation does not accidentally trigger object manipulation', () => {
    // 1. In grab_throw mode, finger touch on a body selects it rather than manipulating
    const touchIntent = resolvePointerIntent({
      tool: 'grab_throw',
      pointerType: 'touch',
      hasHitBody: true,
    });
    expect(touchIntent).toBe('select_body');
    expect(touchIntent).not.toBe('grab_throw_manipulate');

    // 2. In paused state, finger touch on a body selects it rather than manipulating
    const pausedTouchIntent = resolvePointerIntent({
      tool: 'select',
      pointerType: 'touch',
      hasHitBody: true,
      isPaused: true,
    });
    expect(pausedTouchIntent).toBe('select_body');
    expect(pausedTouchIntent).not.toBe('grab_throw_manipulate');

    // 3. Pen/mouse in grab_throw mode DOES manipulate
    const penIntent = resolvePointerIntent({
      tool: 'grab_throw',
      pointerType: 'pen',
      hasHitBody: true,
    });
    expect(penIntent).toBe('grab_throw_manipulate');

    const mouseIntent = resolvePointerIntent({
      tool: 'grab_throw',
      pointerType: 'mouse',
      hasHitBody: true,
    });
    expect(mouseIntent).toBe('grab_throw_manipulate');
  });
});

describe('Integrated PointerManager & Interaction Bridge Lifecycle', () => {
  const createMockElement = () => {
    const listeners: Record<string, ((e: any) => void)[]> = {};
    return {
      addEventListener: (type: string, fn: any) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: any) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter(l => l !== fn);
        }
      },
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      _dispatch: (type: string, event: any) => {
        listeners[type]?.forEach(l => l(event));
      },
    };
  };

  const createMockSceneManager = () => ({
    scene: { add: () => {} },
    floatingOrigin: { toRelative: (p: any) => p, toAbsolute: (p: any) => p },
    scaleTransform: {
      getDisplayPosition: (p: any) => p,
      displayToRelativeKm: (p: any) => p,
    },
    raycastOrbitalPlane: () => ({ x: 100, y: 0, z: 200 }),
    raycastBody: (x: number, _y: number) => (x > 0 ? 'body-alpha' : null),
    setSelectedBody: vi.fn(),
    orbitCamera: vi.fn(),
    zoomCamera: vi.fn(),
    panCamera: vi.fn(),
  });

  it('TEST E: Repeated tool switching SELECT -> LOOM -> SELECT -> LOOM routes correctly without recreating scene', () => {
    const mockElem = createMockElement();
    const mockScene = createMockSceneManager();

    const star: CelestialBody = {
      id: 'body-alpha',
      name: 'Alpha Star',
      type: 'star',
      massKg: SOLAR_MASS_KG,
      radiusKm: 696000,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      color: '#fff',
    };

    const loom = new OrbitLoom(mockScene as any);
    loom.setPrimary(star);

    let activeTool = 'select';
    let selectedBodyId: string | null = null;
    let loomStrokeStarted = false;

    // Simulate persistent PointerManager with latest-value intent bridge
    const pointerMgr = new PointerManager(mockElem as any, {
      onPointerDown: (e) => {
        const hitBodyId = mockScene.raycastBody(e.clientX / 1000, e.clientY / 800);
        const intent = resolvePointerIntent({
          tool: activeTool as any,
          pointerType: e.pointerType,
          hasHitBody: !!hitBodyId,
          pointerCount: pointerMgr.getActivePointerCount(),
        });

        if (intent === 'orbit_loom_draw') {
          pointerMgr.isDrawingOrbit = true;
          loomStrokeStarted = true;
          loom.startStroke();
          return;
        }

        if (intent === 'select_body' && hitBodyId) {
          selectedBodyId = hitBodyId;
          return;
        }

        if (intent === 'deselect') {
          selectedBodyId = null;
        }
      },
      onPointerMove: () => {},
      onPointerUp: () => {
        if (pointerMgr.isDrawingOrbit) {
          pointerMgr.isDrawingOrbit = false;
        }
      },
      onPointerCancel: () => {},
      onPinchZoom: () => {},
      onTwoFingerPan: () => {},
    });

    // Cycle 1: SELECT tool with touch -> selects body
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 400 });
    expect(selectedBodyId).toBe('body-alpha');
    expect(loomStrokeStarted).toBe(false);
    mockElem._dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 400 });

    // Cycle 2: Switch to LOOM -> touch does NOT draw
    activeTool = 'orbit_loom';
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 400 });
    expect(loomStrokeStarted).toBe(false);
    expect(pointerMgr.isDrawingOrbit).toBe(false);
    mockElem._dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 400 });

    // Cycle 3: Switch back to SELECT -> tap empty void deselects
    activeTool = 'select';
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: -100, clientY: 400 });
    expect(selectedBodyId).toBeNull();
    mockElem._dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: -100, clientY: 400 });

    // Cycle 4: Switch to LOOM -> Pen DOES start drawing
    activeTool = 'orbit_loom';
    mockElem._dispatch('pointerdown', { pointerId: 2, pointerType: 'pen', clientX: 300, clientY: 200 });
    expect(loomStrokeStarted).toBe(true);
    expect(pointerMgr.isDrawingOrbit).toBe(true);
    mockElem._dispatch('pointerup', { pointerId: 2, pointerType: 'pen', clientX: 300, clientY: 200 });
    expect(pointerMgr.isDrawingOrbit).toBe(false);

    pointerMgr.destroy();
  });

  it('verifies two-finger pinch and pan while in ORBIT LOOM mode does not start an orbit stroke', () => {
    const mockElem = createMockElement();

    let pinchZoomCalled = false;
    let twoFingerPanCalled = false;
    let strokeCreated = false;

    const pointerMgr = new PointerManager(mockElem as any, {
      onPointerDown: (e) => {
        const intent = resolvePointerIntent({
          tool: 'orbit_loom',
          pointerType: e.pointerType,
          hasHitBody: false,
          pointerCount: pointerMgr.getActivePointerCount(),
        });

        if (intent === 'orbit_loom_draw') {
          pointerMgr.isDrawingOrbit = true;
          strokeCreated = true;
        }
      },
      onPointerMove: () => {},
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onPinchZoom: () => { pinchZoomCalled = true; },
      onTwoFingerPan: () => { twoFingerPanCalled = true; },
    });

    // 1. Finger 1 down at (100, 100)
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(strokeCreated).toBe(false);
    expect(pointerMgr.isDrawingOrbit).toBe(false);

    // 2. Finger 2 down at (200, 200)
    mockElem._dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200 });
    expect(strokeCreated).toBe(false);
    expect(pointerMgr.isDrawingOrbit).toBe(false);

    // 3. Move finger 2 to (250, 250) (pinch gesture)
    mockElem._dispatch('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 250 });
    expect(pinchZoomCalled).toBe(true);
    expect(twoFingerPanCalled).toBe(true);
    expect(strokeCreated).toBe(false);

    // 4. Release both fingers
    mockElem._dispatch('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    mockElem._dispatch('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 250 });
    expect(pointerMgr.isDrawingOrbit).toBe(false);
    expect(strokeCreated).toBe(false);

    pointerMgr.destroy();
  });

  it('proves explicit deltaX and deltaY track touch motion accurately for camera orbiting', () => {
    const mockElem = createMockElement();
    const mockScene = createMockSceneManager();

    let capturedDeltaX = 0;
    let capturedDeltaY = 0;

    const pointerMgr = new PointerManager(mockElem as any, {
      onPointerDown: () => {},
      onPointerMove: (e) => {
        capturedDeltaX = e.deltaX;
        capturedDeltaY = e.deltaY;
        if (e.rawEvent.buttons === 1 || e.pointerType === 'touch') {
          mockScene.orbitCamera(-e.deltaX * 0.006, -e.deltaY * 0.006);
        }
      },
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onPinchZoom: () => {},
      onTwoFingerPan: () => {},
    });

    // Pointer down at (100, 100)
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });

    // Pointer move to (125, 110)
    mockElem._dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 125, clientY: 110, buttons: 1 });

    expect(capturedDeltaX).toBe(25);
    expect(capturedDeltaY).toBe(10);
    expect(mockScene.orbitCamera).toHaveBeenCalledWith(-25 * 0.006, -10 * 0.006);

    pointerMgr.destroy();
  });
});
