import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFillViewportHeight } from "./useFillViewportHeight.js";

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
  for (const name of Object.keys(originalDescriptors)) restoreWindowValue(name);
});

describe("useFillViewportHeight", () => {
  it("uses the visible viewport bottom while the keyboard is open", () => {
    setWindowValue("innerWidth", 390);
    const viewport = makeVisualViewport({ height: 430, offsetTop: 12 });
    setWindowValue("visualViewport", viewport);
    const root = makeRoot(120);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBeLessThanOrEqual(322);
    expect(root.style.getPropertyValue("--inbox-shell-top")).toBe("120px");
    expect(root.style.getPropertyValue("--inbox-bottom-gap")).toBe("72px");
    expect(root.style.getPropertyValue("--inbox-visible-height")).toBe(`${result.current}px`);
  });

  it("keeps the mobile navigation and safe-area inset clear", () => {
    setWindowValue("innerWidth", 390);
    setWindowValue("innerHeight", 800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 34 });
    const root = makeRoot(100);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(594);
    expect(root.style.getPropertyValue("--inbox-bottom-gap")).toBe("106px");
  });

  it("uses the existing desktop bottom gap without visualViewport", () => {
    const root = makeRoot(100);

    const { result } = renderHook(() => useFillViewportHeight({ current: root }));

    expect(result.current).toBe(784);
    expect(root.style.getPropertyValue("--inbox-shell-top")).toBe("100px");
    expect(root.style.getPropertyValue("--inbox-bottom-gap")).toBe("16px");
    expect(root.style.getPropertyValue("--inbox-visible-height")).toBe("784px");
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
    expect(result.current).toBe(544);
    expect(root.style.getPropertyValue("--inbox-visible-height")).toBe("544px");
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
});
