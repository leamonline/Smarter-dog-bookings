import { useEffect, useState } from "react";

/**
 * Reactively track a CSS media query.
 *
 * Reads the initial value synchronously so the first render is already correct
 * (no flicker in this client-only SPA), then subscribes to changes. Guards on
 * `window.matchMedia` so it's safe in non-DOM/test environments (jsdom doesn't
 * implement matchMedia) — there it simply returns `false`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
