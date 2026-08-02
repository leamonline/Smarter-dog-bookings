// ============================================================
// src/components/views/inbox/hooks/useFillViewportHeight.js
//
// Sizes the inbox shell to fill from its own top edge down to the
// bottom of the (dynamic) viewport, instead of guessing the top chrome
// with a magic number like h-[calc(100dvh-180px)].
//
// Why: the old constant assumed a fixed toolbar + header height. When
// the app toolbar wrapped on a narrow screen, or a banner appeared, the
// real top offset exceeded the guess and the inbox overflowed (double
// scrollbars / a clipped composer) — exactly on the phone/iPad the
// salon triages from. Measuring the element's actual top removes the
// guess; only the bottom gap (the fixed mobile nav) stays a constant,
// and that height is stable.
//
// Returns a px number (or null before first measure, so the caller can
// keep a CSS fallback for the first paint). Recomputes on resize and
// orientation change.
// ============================================================

import { useEffect, useState } from "react";

// Clearance below the shell. Mobile has the fixed bottom nav
// (AppToolbar's md:hidden bar); desktop just wants a little breathing
// room above the page edge.
const MOBILE_BOTTOM_GAP = 72;
const DESKTOP_BOTTOM_GAP = 16;
const MOBILE_BREAKPOINT = 768; // Tailwind md
// Retain a usable minimum for the normal layout. When visualViewport reports
// a keyboard-constrained surface, the real visible height takes precedence so
// the composer is not pushed below the keyboard.
const MIN_HEIGHT = 360;

// The mobile nav also carries `pb-[env(safe-area-inset-bottom)]`, so on an
// iPhone with a home indicator its true height is MOBILE_BOTTOM_GAP plus the
// safe-area inset. With viewport-fit=cover, window.innerHeight includes that
// inset, so we must subtract it too — otherwise the shell runs ~34px past the
// nav and the composer sits jammed under it. Measure the inset live (0 off
// iOS) via a throwaway probe, since env() doesn't resolve in JS otherwise.
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
      const bottomGap =
        window.innerWidth < MOBILE_BREAKPOINT
          ? MOBILE_BOTTOM_GAP + safeAreaInsetBottom()
          : DESKTOP_BOTTOM_GAP;
      const viewportBottom = visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight;
      const measured = Math.round(viewportBottom - top - bottomGap);
      const keyboardConstrained = Boolean(
        visualViewport && visualViewport.height < window.innerHeight,
      );
      const available = keyboardConstrained
        ? Math.max(0, measured)
        : Math.max(MIN_HEIGHT, measured);

      el.style.setProperty("--inbox-shell-top", `${Math.round(top)}px`);
      el.style.setProperty("--inbox-bottom-gap", `${Math.round(bottomGap)}px`);
      el.style.setProperty("--inbox-visible-height", `${available}px`);
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
    return () => {
      window.removeEventListener("resize", scheduleCompute);
      window.removeEventListener("orientationchange", scheduleCompute);
      visualViewport?.removeEventListener("resize", scheduleCompute);
      visualViewport?.removeEventListener("scroll", scheduleCompute);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [ref]);

  return height;
}
