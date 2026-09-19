import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFillViewportHeight } from "./useFillViewportHeight.js";
import { VIEWPORT_SETTLE_DELAYS_MS } from "./viewportSettle.js";

const originalDescriptors = {
  innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight"),
  innerWidth: Object.getOwnPropertyDescriptor(window, "innerWidth"),
  visualViewport: Object.getOwnPropertyDescriptor(window, "visualViewport"),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, "cancelAnimationFrame"),
};

function setWindowValue(name, value) {
  Object.defineProperty(window, name, { configurable: true, writable: true, value });
}

function restoreWindowValue(name) {
  const descriptor = originalDescriptors[name];
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
  } else {
    delete window[name];
  }
}

function makeRoot(top) {
  const element = document.createElement("div");
  element.getBoundingClientRect = vi.fn(() => ({ top }));
  return element;
}

function makeVisualViewport({ height, offsetTop }) {
  const viewport = new EventTarget();
  Object.assign(viewport, { height, offsetTop });
  return viewport;
}

function installResizeObserver() {
  const state = { observed: [], disconnected: false, callbacks: [] };
  class StubResizeObserver {
    constructor(callback) {
      state.callbacks.push(callback);
    }

    observe(target) {
      state.observed.push(target);
    }

    disconnect() {
      state.disconnected = true;
    }
  }
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  state.trigger = () => {
    for (const callback of state.callbacks) callback([], null);
  };
  return state;
}

function installAnimationFrameQueue() {
  let nextId = 1;
  const frames = new Map();
  const request = vi.fn((callback) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id) => frames.delete(id));
  setWindowValue("requestAnimationFrame", request);
  setWindowValue("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
  };
}

beforeEach(() => {
  setWindowValue("innerWidth", 1024);
  setWindowValue("innerHeight", 900);
  setWindowValue("visualViewport", undefined);
  installAnimationFrameQueue();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const name of Object.keys(originalDescriptors)) restoreWindowValue(name);
});

describe("useFillViewportHeight", () => {
  it("uses the visible viewport bottom while the keyboard is open", () => {
    setWindowValue("innerWidth", 390);
    const viewport = makeVisualViewport({ height: 430, offsetTop: 12 });
    setWindowValue("visualViewport", viewport);
    const root = makeRoot(120);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(298);
    expect(root.style.getPropertyValue("--fill-top")).toBe("120px");
    expect(root.style.getPropertyValue("--fill-bottom-gap")).toBe("24px");
    expect(root.style.getPropertyValue("--fill-visible-height")).toBe(`${result.current}px`);
  });

  it("reserves the safe-area inset and nothing for a bottom navigation bar", () => {
    // The staff nav is a strip under the top chrome, not a fixed bottom bar,
    // so the only clearance a phone owes is the home indicator. The 72px the
    // hook used to hold back for that bar cost a message and the composer.
    setWindowValue("innerWidth", 390);
    setWindowValue("innerHeight", 800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 34 });
    const root = makeRoot(100);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(642);
    expect(root.style.getPropertyValue("--fill-bottom-gap")).toBe("58px");
  });

  it("uses the same bottom gap at desktop width", () => {
    const root = makeRoot(100);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(776);
    expect(root.style.getPropertyValue("--fill-top")).toBe("100px");
    expect(root.style.getPropertyValue("--fill-bottom-gap")).toBe("24px");
    expect(root.style.getPropertyValue("--fill-visible-height")).toBe("776px");
  });

  it("reports what a short window actually leaves rather than a comfortable floor", () => {
    // A laptop in split screen, a half-open foldable, a short browser window:
    // rounding these up to a 360px minimum pushed the composer out of a pane
    // that clips its own overflow, with no page scroll to bring it back.
    setWindowValue("innerHeight", 420);
    const root = makeRoot(180);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(216);
    expect(root.style.getPropertyValue("--fill-visible-height")).toBe("216px");
  });

  it("never reports a negative height when the chrome outgrows the window", () => {
    setWindowValue("innerHeight", 200);
    const root = makeRoot(400);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(0);
  });

  it("coalesces visualViewport resize and scroll events into one animation frame", () => {
    const animationFrames = installAnimationFrameQueue();
    const viewport = makeVisualViewport({ height: 700, offsetTop: 0 });
    setWindowValue("visualViewport", viewport);
    const root = makeRoot(100);
    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    viewport.height = 650;
    viewport.offsetTop = 10;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(animationFrames.request).toHaveBeenCalledTimes(1);
    act(() => animationFrames.flush());
    expect(result.current).toBe(536);
    expect(root.style.getPropertyValue("--fill-visible-height")).toBe("536px");
  });

  it("re-measures when chrome above the shell changes height without a resize", () => {
    // A banner appearing, the toolbar wrapping, the nav strip gaining an
    // approvals badge: the shell's top edge moves while innerHeight does not,
    // so no resize event ever fires and the old height would simply stand.
    //
    // Watching document.body alone used to be enough, because the chrome sat
    // in the body's normal flow and the body grew with it. Under the
    // fixed-height AppFrame it does not: a taller toolbar takes its height
    // from the workspace rather than adding it to the page, so the body never
    // changes size. Every ancestor is watched instead, so whichever one
    // absorbs the change still reports it.
    const animationFrames = installAnimationFrameQueue();
    const observer = installResizeObserver();
    let top = 100;
    const shell = document.createElement("div");
    const main = document.createElement("main");
    const root = document.createElement("div");
    root.getBoundingClientRect = vi.fn(() => ({ top }));
    main.appendChild(root);
    shell.appendChild(main);
    document.body.appendChild(shell);

    const { result, unmount } = renderHook(() => useFillViewportHeight({ current: root }));
    expect(result.current).toBe(776);
    // The flex parent that actually absorbs a chrome change, not just the body.
    expect(observer.observed).toContain(main);
    expect(observer.observed).toContain(shell);
    expect(observer.observed).toContain(document.body);

    top = 180;
    act(() => observer.trigger());
    act(() => animationFrames.flush());

    expect(result.current).toBe(696);
    expect(root.style.getPropertyValue("--fill-top")).toBe("180px");

    unmount();
    expect(observer.disconnected).toBe(true);
    shell.remove();
  });

  it("removes window and visual viewport listeners and cancels pending work", () => {
    const animationFrames = installAnimationFrameQueue();
    const viewport = makeVisualViewport({ height: 700, offsetTop: 0 });
    const removeViewportListener = vi.spyOn(viewport, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    setWindowValue("visualViewport", viewport);
    const root = makeRoot(100);
    const { unmount } = renderHook(() => useFillViewportHeight({ current: root }));

    act(() => viewport.dispatchEvent(new Event("resize")));
    unmount();

    expect(removeViewportListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeViewportListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("orientationchange", expect.any(Function));
    expect(animationFrames.cancel).toHaveBeenCalledTimes(1);
  });
  it("re-measures after the keyboard lands when the first resize carried an intermediate height", () => {
    // iOS fires visualViewport resize as the keyboard STARTS to move, with
    // the height at that instant, and nothing when it finishes landing
    // ~250ms later. Measured once, the shell stayed ~140px too tall and the
    // reply box sat exactly under the keyboard's accessory bar on a real
    // iPhone — while a simulation that reported the final height in one
    // event passed. These numbers are that phone's: 852 tall, 84px of chrome
    // once the toolbar has stepped aside, 495px visible above the keyboard.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const animationFrames = installAnimationFrameQueue();
      setWindowValue("innerWidth", 393);
      setWindowValue("innerHeight", 852);
      const viewport = makeVisualViewport({ height: 852, offsetTop: 0 });
      setWindowValue("visualViewport", viewport);
      const root = makeRoot(84);
      // A stable ref, as useRef gives the real caller: a fresh { current }
      // object per render would re-run the effect on every measurement and
      // cancel the settle timers this test exists to exercise.
      const ref = { current: root };
      const { result } = renderHook(() => useFillViewportHeight(ref));
      expect(result.current).toBe(744);

      viewport.height = 640;
      act(() => viewport.dispatchEvent(new Event("resize")));
      act(() => animationFrames.flush());
      // The intermediate answer, which used to be the final one.
      expect(result.current).toBe(532);

      viewport.height = 495;
      act(() => {
        vi.advanceTimersByTime(VIEWPORT_SETTLE_DELAYS_MS[VIEWPORT_SETTLE_DELAYS_MS.length - 1]);
      });
      expect(result.current).toBe(387);
      expect(root.style.getPropertyValue("--fill-visible-height")).toBe("387px");
    } finally {
      vi.useRealTimers();
    }
  });
});
