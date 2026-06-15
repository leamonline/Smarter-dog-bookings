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
const MIN_HEIGHT = 360; // never collapse below a usable height

export function useFillViewportHeight(ref) {
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;

    const compute = () => {
      const top = el.getBoundingClientRect().top;
      const bottomGap =
        window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_BOTTOM_GAP : DESKTOP_BOTTOM_GAP;
      const available = window.innerHeight - top - bottomGap;
      setHeight(Math.max(MIN_HEIGHT, Math.round(available)));
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [ref]);

  return height;
}
