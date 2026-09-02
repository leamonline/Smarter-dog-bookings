import { useEffect, useRef, useState, useCallback } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved";

export interface UseAutosaveOptions {
  /** Debounce delay in ms (default 1500). */
  delay?: number;
  /** Whether autosave is active (default true). */
  enabled?: boolean;
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  /** Save immediately if anything changed since the last accepted save. */
  flush: () => Promise<void>;
}

/**
 * useAutosave — debounced autosave hook.
 * Returns { status, flush } where status is "idle" | "saving" | "saved".
 *
 * Change detection is by JSON equality against the last accepted snapshot,
 * so `data` should be plain serialisable state.
 */
export function useAutosave<T>(
  data: T,
  saveFn: (data: T) => Promise<unknown> | unknown,
  { delay = 1500, enabled = true }: UseAutosaveOptions = {},
): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef<T>(data);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const hasChanged = useCallback(() => {
    return JSON.stringify(data) !== JSON.stringify(initialRef.current);
  }, [data]);

  useEffect(() => {
    if (!enabled || !hasChanged()) return;

    setStatus("idle");
    timerRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        await saveFnRef.current(data);
        setStatus("saved");
        initialRef.current = data;
        setTimeout(() => setStatus((s) => s === "saved" ? "idle" : s), 2000);
      } catch {
        setStatus("idle");
      }
    }, delay);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [data, delay, enabled, hasChanged]);

  const flush = useCallback(async () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (hasChanged()) {
      setStatus("saving");
      try {
        await saveFnRef.current(data);
        setStatus("saved");
        initialRef.current = data;
      } catch {
        setStatus("idle");
      }
    }
  }, [data, hasChanged]);

  return { status, flush };
}
