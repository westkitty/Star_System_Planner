import { describe, it, expect, vi } from 'vitest';
import { PointerManager } from '../interaction/pointer-manager';

const createMockElement = () => {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  return {
    addEventListener: (type: string, fn: any) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: any) => {
      if (listeners[type]) listeners[type] = listeners[type].filter(l => l !== fn);
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    _dispatch: (type: string, event: any) => {
      listeners[type]?.forEach(l => l({ preventDefault: () => {}, ...event }));
    },
  };
};

const baseCallbacks = () => ({
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
  onPinchZoom: vi.fn(),
  onTwoFingerPan: vi.fn(),
  onWheelZoom: vi.fn(),
  onDoubleTap: vi.fn(),
  onPenQuickAction: vi.fn(),
});

describe('Extended gesture plane — wheel, double-tap, pen barrel', () => {
  it('wheel events route to zoom and always preventDefault (no page scroll fight)', () => {
    const mockElem = createMockElement();
    const cb = baseCallbacks();
    new PointerManager(mockElem as any, cb);

    let prevented = 0;
    mockElem._dispatch('wheel', {
      deltaY: 240,
      preventDefault: () => { prevented++; },
    });
    expect(cb.onWheelZoom).toHaveBeenCalledTimes(1);
    expect(cb.onWheelZoom).toHaveBeenCalledWith(240);
    expect(prevented).toBe(1);
  });

  it('rapid dual taps at the same point emit exactly one double-tap, no phantom second pointer-down', () => {
    const mockElem = createMockElement();
    const cb = baseCallbacks();
    const mgr = new PointerManager(mockElem as any, cb);
    void mgr;

    let now = 1000;
    const down = (x: number, y: number) => mockElem._dispatch('pointerdown', {
      pointerId: 11, pointerType: 'touch', clientX: x, clientY: y,
      isPrimary: true, buttons: 1, button: 0, timeStamp: (now += 90), rawEvent: {},
    });

    down(500, 400);   // first tap
    down(508, 402);   // second tap within 320 ms and 24 px
    expect(cb.onDoubleTap).toHaveBeenCalledTimes(1);
    // the second gesture was consumed as the double-tap trigger
    expect(cb.onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('two taps far apart in time or space do NOT emit double-tap', () => {
    const mockElem = createMockElement();
    const cb = baseCallbacks();
    new PointerManager(mockElem as any, cb);

    let now = 2000;
    const down = (x: number, y: number) => mockElem._dispatch('pointerdown', {
      pointerId: 12, pointerType: 'touch', clientX: x, clientY: y,
      isPrimary: true, buttons: 1, button: 0, timeStamp: (now += 900), rawEvent: {},
    });

    down(500, 400);
    down(500, 400); // 900 ms later — too slow
    expect(cb.onDoubleTap).not.toHaveBeenCalled();
    expect(cb.onPointerDown).toHaveBeenCalledTimes(2);
  });

  it('pen barrel-button press is a quick action, never a stroke start', () => {
    const mockElem = createMockElement();
    const cb = baseCallbacks();
    new PointerManager(mockElem as any, cb);

    mockElem._dispatch('pointerdown', {
      pointerId: 21, pointerType: 'pen', clientX: 400, clientY: 300,
      isPrimary: true, buttons: 2, button: 1, timeStamp: 5000, rawEvent: {},
    });

    expect(cb.onPenQuickAction).toHaveBeenCalledTimes(1);
    expect(cb.onPointerDown).not.toHaveBeenCalled();
  });

  it('mouse primary down still flows to onPointerDown (modality routing preserved)', () => {
    const mockElem = createMockElement();
    const cb = baseCallbacks();
    new PointerManager(mockElem as any, cb);

    mockElem._dispatch('pointerdown', {
      pointerId: 31, pointerType: 'mouse', clientX: 100, clientY: 100,
      isPrimary: true, buttons: 1, button: 0, timeStamp: 99999999, rawEvent: {},
    });
    expect(cb.onPointerDown).toHaveBeenCalledTimes(1);
    expect(cb.onPenQuickAction).not.toHaveBeenCalled();
  });
});
