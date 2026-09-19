// ============================================================
// src/hooks/useKeyboardOpen.js
//
// Marks <html data-keyboard-open> while a phone's on-screen keyboard is up
// and a text field has focus, so CSS can step the app chrome aside.
//
// Why. On a 390px phone the toolbar, nav strip and page padding hold
// ~130px above the workspace, and none of it moves when the keyboard
// opens. A keyboard leaves ~330px visible, so the conversation someone is
// replying to shrinks from ~510px to ~180px — a reflow big enough to read
// as "the screen resized" (the second half of the mobile Inbox report,
// alongside the composer clipping fixed in #885). Native messaging apps
// answer this by hiding their chrome while you type; this is that.
//
// Detection is the visible height falling short of the no-keyboard height
// by KEYBOARD_MIN_INSET or more. That reads both platforms the same way:
// iOS Safari shrinks only the visual viewport (window.innerHeight never
// moves), Chrome on Android shrinks the layout viewport too (index.html
// declares interactive-widget=resizes-content), and either way
// visualViewport.height is what is actually left. The no-keyboard height
// is the largest height seen at the current width, re-baselined when the
// width changes so rotating the phone is not mistaken for a keyboard.
//
// Two guards keep it honest. It only fires while a text-entry element
// has focus, so pinch-zoom (which also shrinks the visual viewport) never
// hides the nav; and it is a plain attribute rather than React state, so
// the whole app does not re-render on every keyboard frame — CSS reads
// the attribute through the `keyboard:` variant in index.css.
// ============================================================

import { useEffect } from "react";

// iOS Safari's collapsing address bar takes 50–80px; a keyboard takes
// 250px or more. 120 sits comfortably between the two.
export const KEYBOARD_MIN_INSET = 120;

export const KEYBOARD_OPEN_ATTR = "data-keyboard-open";

// Field types that never summon a keyboard on focus.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTextEntryElement(element) {
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (element.getAttribute("type") || "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return element.isContentEditable === true;
}

export function useKeyboardOpen() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    let baselineWidth = window.innerWidth;
    let baselineHeight = window.innerHeight;
    let animationFrameId = null;

    const visibleHeight = () =>
      visualViewport ? visualViewport.height : window.innerHeight;

    const compute = () => {
      // A width change is a rotation or a window resize, not a keyboard:
      // start the no-keyboard height again from what is there now.
      if (window.innerWidth !== baselineWidth) {
        baselineWidth = window.innerWidth;
        baselineHeight = window.innerHeight;
      }
      const visible = visibleHeight();
      // The no-keyboard height is the most room ever seen at this width.
      // innerHeight grows when Safari's address bar collapses and shrinks
      // back when Android's keyboard closes, so track the maximum rather
      // than the latest value.
      baselineHeight = Math.max(baselineHeight, window.innerHeight, visible);

      const inset = baselineHeight - visible;
      const open =
        inset >= KEYBOARD_MIN_INSET && isTextEntryElement(document.activeElement);

      if (open) root.setAttribute(KEYBOARD_OPEN_ATTR, "");
      else root.removeAttribute(KEYBOARD_OPEN_ATTR);
    };

    const scheduleCompute = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        compute();
      });
    };

    compute();
    window.addEventListener("resize", scheduleCompute);
    window.addEventListener("orientationchange", scheduleCompute);
    visualViewport?.addEventListener("resize", scheduleCompute);
    visualViewport?.addEventListener("scroll", scheduleCompute);
    // Focus moving is what opens and closes the keyboard, and focusout is
    // the earliest signal that it is going — earlier than the viewport
    // growing back — so the chrome returns without a lag.
    document.addEventListener("focusin", scheduleCompute);
    document.addEventListener("focusout", scheduleCompute);

    return () => {
      window.removeEventListener("resize", scheduleCompute);
      window.removeEventListener("orientationchange", scheduleCompute);
      visualViewport?.removeEventListener("resize", scheduleCompute);
      visualViewport?.removeEventListener("scroll", scheduleCompute);
      document.removeEventListener("focusin", scheduleCompute);
      document.removeEventListener("focusout", scheduleCompute);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      root.removeAttribute(KEYBOARD_OPEN_ATTR);
    };
  }, []);
}
