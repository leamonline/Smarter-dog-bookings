// Safe wrappers around localStorage / sessionStorage.
//
// Both APIs throw if the user is in private/incognito mode, has
// disabled storage, or has filled the quota. Callers shouldn't have to
// litter try/catch around every access; these helpers swallow the
// failure and return a sentinel so the caller can branch on success
// without ever crashing.
type WebStorageArea = "local" | "session";

function resolveStore(area: WebStorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGet(area: WebStorageArea, key: string): string | null {
  const store = resolveStore(area);
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(area: WebStorageArea, key: string, value: string): boolean {
  const store = resolveStore(area);
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(area: WebStorageArea, key: string): boolean {
  const store = resolveStore(area);
  if (!store) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
