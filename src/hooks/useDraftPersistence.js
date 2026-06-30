import { useCallback, useRef } from "react";
import { safeGet, safeSet, safeRemove } from "../lib/storage";

/**
 * useDraftPersistence — persist an in-progress form to localStorage so it
 * survives navigation, the browser back button, and a refresh.
 *
 * Customer forms (signup, booking wizard, my-details) hold their data in
 * React state only, so leaving the page wipes everything the customer typed.
 * This hook gives those forms a durable draft:
 *
 *   const { restored, save, clear } = useDraftPersistence(key);
 *   const [name, setName] = useState(() => restored?.name ?? "");
 *   useEffect(() => { save({ name, ... }); }, [save, name, ...]);
 *   // on successful submit / cancel: clear();
 *
 * `restored` is read once, synchronously, on the first render so consumers can
 * hydrate lazy useState initialisers from it. Drafts older than `maxAgeMs` are
 * ignored (and cleared) so a half-finished form doesn't resurrect weeks later.
 *
 * Keys should be namespaced per signed-in user so two customers on a shared
 * device never see each other's draft, e.g. `sdb:draft:signup:<humanId>`.
 *
 * @param {string} key — localStorage key for this draft
 * @param {object} options
 * @param {boolean} options.enabled — when false, reads/writes are no-ops (default true)
 * @param {number} options.maxAgeMs — ignore drafts older than this (default 7 days)
 * @returns {{ restored: object|null, save: (data: object) => void, clear: () => void }}
 */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readDraft(key, maxAgeMs) {
  const raw = safeGet("local", key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > maxAgeMs) {
      safeRemove("local", key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    // Corrupt JSON — treat as no draft. (Storage failures are already
    // swallowed by safeGet/safeRemove above.)
    return null;
  }
}

export function useDraftPersistence(key, { enabled = true, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  // Read the draft exactly once, on first render, so consumers can use it in
  // lazy useState initialisers. A ref (not state) keeps this stable across
  // re-renders without triggering its own render.
  const restoredRef = useRef(undefined);
  if (restoredRef.current === undefined) {
    restoredRef.current = enabled ? readDraft(key, maxAgeMs) : null;
  }

  const save = useCallback(
    (data) => {
      if (!enabled) return;
      // Quota exceeded / storage unavailable is swallowed by safeSet — a lost
      // draft is acceptable, a crash isn't.
      safeSet("local", key, JSON.stringify({ savedAt: Date.now(), data }));
    },
    [key, enabled],
  );

  const clear = useCallback(() => {
    safeRemove("local", key);
  }, [key]);

  return { restored: restoredRef.current, save, clear };
}
