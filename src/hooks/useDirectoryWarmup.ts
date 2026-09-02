/**
 * useDirectoryWarmup — a one-way latch that decides when the deferred
 * dogs/humans directory page-0 fetches may start (see useDogs / useHumans
 * `startDirectoryFetch`). It flips true permanently on the FIRST of:
 *
 *   - the route needing directory data (pathname starts with /dogs or
 *     /humans — directory grids and profile pages),
 *   - the new-booking modal opening (its dog picker reads the directory;
 *     App.jsx owns that state, which covers both the toolbar button and
 *     the N keyboard shortcut), or
 *   - an idle warmup registered on mount, so the directories are warm
 *     shortly after boot even if the user stays on the calendar. This is a
 *     2.5s timer FOLLOWED by a requestIdleCallback (where available) — a
 *     bare requestIdleCallback fires almost immediately on an idle page,
 *     which would put the two 50-row fetches straight back on the boot
 *     path (the e2e boot probe asserts none fire within the first second).
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const IDLE_TIMEOUT_MS = 2500;

export interface UseDirectoryWarmupOptions {
  newBookingOpen?: boolean;
}

export function useDirectoryWarmup({ newBookingOpen = false }: UseDirectoryWarmupOptions = {}): boolean {
  const { pathname } = useLocation();
  const [latched, setLatched] = useState(false);

  // Computed synchronously so navigation / modal-open starts the fetch on
  // the same render, not an effect-tick later.
  const warm =
    latched ||
    newBookingOpen ||
    pathname.startsWith("/dogs") ||
    pathname.startsWith("/humans");

  // Latch: once any trigger has fired, stay true even when the user
  // navigates away or the modal closes.
  useEffect(() => {
    if (warm && !latched) setLatched(true);
  }, [warm, latched]);

  // Idle warmup, registered once on mount: wait out the boot window first,
  // then yield to any work in progress at that moment via
  // requestIdleCallback (falling back to firing directly where rIC does
  // not exist, e.g. jsdom).
  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    const fire = () => {
      if (!cancelled) setLatched(true);
    };
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(fire, { timeout: 500 });
      } else {
        fire();
      }
    }, IDLE_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idleHandle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle);
      }
    };
  }, []);

  return warm;
}
