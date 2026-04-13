import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useAutosave — debounced autosave hook.
 * Returns { status } where status is "idle" | "saving" | "saved".
 *
 * @param {object} data — the data to watch for changes
 * @param {function} saveFn — async function called with data to persist
 * @param {object} options
 * @param {number} options.delay — debounce delay in ms (default 1500)
 * @param {boolean} options.enabled — whether autosave is active (default true)
 */
export function useAutosave(data, saveFn, { delay = 1500, enabled = true } = {}) {
  const [status, setStatus] = useState("idle");
  const timerRef = useRef(null);
  const initialRef = useRef(data);
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

    return () => clearTimeout(timerRef.current);
  }, [data, delay, enabled, hasChanged]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
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
