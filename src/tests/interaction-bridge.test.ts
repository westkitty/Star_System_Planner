import { describe, it, expect, vi } from 'vitest';
import { PointerManager } from '../interaction/pointer-manager';
import { OrbitLoom } from '../interaction/orbit-loom';
import { CelestialBody } from '../simulation/types';
import { SOLAR_MASS_KG } from '../simulation/units';

describe('Interaction State Bridge & Long-Lived Callback Dynamics', () => {
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

  it('proves tool switching immediately alters canvas pointer behavior without recreating PointerManager', () => {
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

    // Simulate persistent PointerManager created once on mount
    const pointerMgr = new PointerManager(mockElem as any, {
      onPointerDown: (e) => {
        // Reads dynamic activeTool from closure bridge
        if (activeTool === 'orbit_loom') {
          pointerMgr.isDrawingOrbit = true;
          loomStrokeStarted = true;
          loom.startStroke();
          return;
        }

        const hit = mockScene.raycastBody(e.clientX / 1000, e.clientY / 800);
        if (hit) {
          selectedBodyId = hit;
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

    // 1. Initially tool is SELECT: tapping dispatches selection
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 400 });
    expect(selectedBodyId).toBe('body-alpha');
    expect(loomStrokeStarted).toBe(false);

    // 2. User switches tool to ORBIT LOOM in UI (without destroying pointerMgr)
    activeTool = 'orbit_loom';

    // 3. Pointer event now immediately routes into Orbit Loom
    mockElem._dispatch('pointerdown', { pointerId: 1, pointerType: 'pen', clientX: 300, clientY: 200 });
    expect(loomStrokeStarted).toBe(true);
    expect(pointerMgr.isDrawingOrbit).toBe(true);

    // 4. Pointer up cleanly ends orbit stroke
    mockElem._dispatch('pointerup', { pointerId: 1, pointerType: 'pen', clientX: 300, clientY: 200 });
    expect(pointerMgr.isDrawingOrbit).toBe(false);

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
        if (e.rawEvent.buttons === 1) {
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

    // Pointer move to (125, 110) with buttons: 1
    mockElem._dispatch('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 125, clientY: 110, buttons: 1 });

    expect(capturedDeltaX).toBe(25);
    expect(capturedDeltaY).toBe(10);
    expect(mockScene.orbitCamera).toHaveBeenCalledWith(-25 * 0.006, -10 * 0.006);

    pointerMgr.destroy();
  });
});
