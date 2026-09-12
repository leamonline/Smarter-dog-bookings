// ============================================================
// src/hooks/useFillViewportHeight.js
//
// Sizes an element to fill from its own top edge down to the bottom of
// the VISUAL viewport, instead of guessing the top chrome with a magic
// number like h-[calc(100dvh-180px)].
//
// Scope note. Since AppFrame became a fixed-height flex column, ordinary
// "fill the window" layout is CSS's job: the browser already knows what
// height is left after the chrome, and `h-full`/`min-h-0` inherits it.
// This hook is for the one case CSS cannot see — the on-screen keyboard,
// which by default shrinks the visual viewport without resizing the
// layout viewport, so `dvh` and flexbox both keep their pre-keyboard
// answer. That is why the Inbox and Booking Desk composers still use it
// and the dashboard does not.
//
// Why: the old constant assumed a fixed toolbar + header height. When
// the app toolbar wrapped on a narrow screen, or a banner appeared, the
// real top offset exceeded the guess and the inbox overflowed (double
// scrollbars / a clipped composer) — exactly on the phone/iPad the
// salon triages from. Measuring the element's actual top removes the
// guess.
//
// Returns a px number (or null before first measure, so the caller can
// keep a CSS fallback for the first paint). Recomputes whenever the
// window, the visual viewport or the chrome above the shell changes.
// ============================================================

import { useEffect, useState } from "react";

// Clearance below the shell, matching the workspace track's own bottom
// padding: reserve less than that and the padding pushes the pane past the
// viewport, which is the second scrollbar this hook exists to remove.
//
// This used to reserve an extra 72px on phones for a fixed bottom navigation
// bar. There is no bottom bar — the mobile primary nav is MobileNavStrip, a
// strip in normal flow directly under the top chrome. The allowance outlived
// the bar it was measured from and quietly cost every phone ~72px of thread,
// roughly the composer plus the message above it.
const SHELL_BOTTOM_GAP = 24;

// The safe-area inset is real clearance, and still ours to subtract: with
// viewport-fit=cover, window.innerHeight includes the home-indicator strip, so
// a shell sized to the full innerHeight would run underneath it. env() doesn't
// resolve in JS, so measure it live via a throwaway probe (0 off iOS).
function safeAreaInsetBottom() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const inset = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(inset) ? inset : 0;
}

export function useFillViewportHeight(ref) {
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;

    const visualViewport = window.visualViewport;
    let animationFrameId = null;

    const compute = () => {
      const top = el.getBoundingClientRect().top;
      const bottomGap = SHELL_BOTTOM_GAP + safeAreaInsetBottom();
      const viewportBottom = visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight;
      // Whatever is genuinely left is what the shell gets — no comfortable
      // minimum. A short window, a split-screen tablet, a half-open foldable
      // and an on-screen keyboard all leave less than one, and inventing the
      // difference puts the composer below the fold of a pane that clips its
      // own overflow. InboxWorkspaceShell reads this back and drops its CSS
      // min-height when the measurement lands under it, so the panes shrink
      // and scroll internally instead.
      const available = Math.max(0, Math.round(viewportBottom - top - bottomGap));

      el.style.setProperty("--fill-top", `${Math.round(top)}px`);
      el.style.setProperty("--fill-bottom-gap", `${Math.round(bottomGap)}px`);
      el.style.setProperty("--fill-visible-height", `${available}px`);
      setHeight(available);
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

    // The chrome above the shell can change height without the window
    // resizing at all: an error or offline banner appearing, the toolbar
    // wrapping to two rows, the nav strip gaining an approvals badge. Each
    // moves our top edge while innerHeight stays put, so the resize listeners
    // never hear about it and the shell keeps its old, now-wrong height.
    //
    // This used to watch document.body alone, on the assumption that
    // everything above us sat in the body's normal flow so the body grew
    // whenever the chrome did. That stopped being true when AppFrame became a
    // fixed-height flex column: a toolbar wrapping to a second row now takes
    // its extra height *from* the workspace instead of adding it to the page,
    // so the body never changes size and the observer never fires — while our
    // top edge has moved all the same. Watching each ancestor instead catches
    // it either way, whichever of them absorbs the change.
    const ancestorObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleCompute);
    if (ancestorObserver) {
      for (let node = el.parentElement; node; node = node.parentElement) {
        ancestorObserver.observe(node);
      }
    }

    return () => {
      window.removeEventListener("resize", scheduleCompute);
      window.removeEventListener("orientationchange", scheduleCompute);
      visualViewport?.removeEventListener("resize", scheduleCompute);
      visualViewport?.removeEventListener("scroll", scheduleCompute);
      ancestorObserver?.disconnect();
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [ref]);

  return height;
}
