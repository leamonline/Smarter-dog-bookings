import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function matches() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

/**
 * True while the viewer has asked for reduced motion. The stack switches state
 * instead of animating when it is set: no lift, no pile, no smooth scroll. The
 * CSS media query covers the transitions as well; this is for the parts that
 * are not CSS (scroll behaviour) and so the state is observable in tests.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    setReduced(query.matches);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
