import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_MIN_INSET,
  KEYBOARD_OPEN_ATTR,
  isTextEntryElement,
  useKeyboardOpen,
} from "./useKeyboardOpen.js";
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
  if (descriptor) Object.defineProperty(window, name, descriptor);
  else delete window[name];
}

function makeVisualViewport({ height, offsetTop = 0 }) {
  const viewport = new EventTarget();
  Object.assign(viewport, { height, offsetTop });
  return viewport;
}

function installAnimationFrameQueue() {
  let nextId = 1;
  const frames = new Map();
  setWindowValue("requestAnimationFrame", vi.fn((callback) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, callback);
    return id;
  }));
  setWindowValue("cancelAnimationFrame", vi.fn((id) => frames.delete(id)));
  return {
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
  };
}

const isOpen = () => document.documentElement.hasAttribute(KEYBOARD_OPEN_ATTR);

let frames;
let viewport;
let textarea;

beforeEach(() => {
  setWindowValue("innerWidth", 390);
  setWindowValue("innerHeight", 844);
  viewport = makeVisualViewport({ height: 844 });
  setWindowValue("visualViewport", viewport);
  frames = installAnimationFrameQueue();
  textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
});

afterEach(() => {
  textarea.remove();
  document.documentElement.removeAttribute(KEYBOARD_OPEN_ATTR);
  vi.restoreAllMocks();
  for (const name of Object.keys(originalDescriptors)) restoreWindowValue(name);
});

/** Shrink the visual viewport the way a keyboard does and let the hook see it. */
function keyboard(height) {
  viewport.height = height;
  act(() => viewport.dispatchEvent(new Event("resize")));
  act(() => frames.flush());
}

describe("isTextEntryElement", () => {
  it("recognises the fields that summon a keyboard and nothing else", () => {
    const input = (type) => {
      const el = document.createElement("input");
      if (type) el.setAttribute("type", type);
      return el;
    };
    expect(isTextEntryElement(document.createElement("textarea"))).toBe(true);
    expect(isTextEntryElement(input())).toBe(true);
    expect(isTextEntryElement(input("search"))).toBe(true);
    expect(isTextEntryElement(input("tel"))).toBe(true);
    for (const type of ["checkbox", "radio", "range", "color", "file", "submit", "button", "hidden"]) {
      expect(isTextEntryElement(input(type)), type).toBe(false);
    }
    expect(isTextEntryElement(document.createElement("button"))).toBe(false);
    expect(isTextEntryElement(document.body)).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });
});

describe("useKeyboardOpen", () => {
  it("stays quiet with no keyboard", () => {
    renderHook(() => useKeyboardOpen());
    expect(isOpen()).toBe(false);
  });

  it("flags the keyboard once a text field has focus and the visible height drops (iOS)", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    // iOS: innerHeight stays at 844, only the visual viewport shrinks.
    keyboard(430);
    expect(isOpen()).toBe(true);
  });

  it("flags the keyboard when the layout viewport shrinks with it (Android)", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    // interactive-widget=resizes-content: innerHeight and the visual
    // viewport shrink together.
    setWindowValue("innerHeight", 430);
    keyboard(430);
    expect(isOpen()).toBe(true);
  });

  it("does not mistake pinch-zoom for a keyboard: no text field, no flag", () => {
    renderHook(() => useKeyboardOpen());
    const button = document.createElement("button");
    document.body.appendChild(button);
    act(() => button.focus());
    keyboard(430);
    expect(isOpen()).toBe(false);
    button.remove();
  });

  it("ignores Safari's collapsing address bar, which is well under the inset", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    keyboard(844 - (KEYBOARD_MIN_INSET - 1));
    expect(isOpen()).toBe(false);
  });

  it("clears as soon as focus leaves, before the viewport grows back", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    keyboard(430);
    expect(isOpen()).toBe(true);

    act(() => textarea.blur());
    act(() => document.dispatchEvent(new Event("focusout")));
    act(() => frames.flush());
    expect(isOpen()).toBe(false);
  });

  it("does not read a rotation as a keyboard", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    // Landscape: the width changes and the height drops well past the
    // inset, but that is a new baseline, not a keyboard.
    setWindowValue("innerWidth", 844);
    setWindowValue("innerHeight", 390);
    viewport.height = 390;
    act(() => window.dispatchEvent(new Event("resize")));
    act(() => frames.flush());
    expect(isOpen()).toBe(false);

    // A keyboard on top of the landscape baseline is still recognised.
    keyboard(200);
    expect(isOpen()).toBe(true);
  });

  it("keeps the no-keyboard height after a keyboard has come and gone", () => {
    renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    keyboard(430);
    expect(isOpen()).toBe(true);
    keyboard(844);
    expect(isOpen()).toBe(false);
    // Second keyboard at the same width must still register.
    keyboard(430);
    expect(isOpen()).toBe(true);
  });

  it("removes the attribute and its listeners on unmount", () => {
    const removeViewportListener = vi.spyOn(viewport, "removeEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useKeyboardOpen());
    act(() => textarea.focus());
    keyboard(430);
    expect(isOpen()).toBe(true);

    unmount();

    expect(isOpen()).toBe(false);
    expect(removeViewportListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeViewportListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("focusout", expect.any(Function));
  });
  it("keeps re-checking after a resize so a keyboard that lands late is still seen", () => {
    // The first resize iOS fires can arrive while the keyboard is still
    // short of the detection inset; the landing itself fires nothing.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      renderHook(() => useKeyboardOpen());
      act(() => textarea.focus());
      keyboard(844 - (KEYBOARD_MIN_INSET - 20));
      expect(isOpen()).toBe(false);

      viewport.height = 430;
      act(() => {
        vi.advanceTimersByTime(VIEWPORT_SETTLE_DELAYS_MS[VIEWPORT_SETTLE_DELAYS_MS.length - 1]);
      });
      expect(isOpen()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
