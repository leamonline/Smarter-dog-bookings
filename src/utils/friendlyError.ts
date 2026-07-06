// ============================================================
// friendlyError — pure TS, zero React.
//
// Customer-facing write failures (onboarding, adding a dog) used to splice the
// raw Supabase / Postgres / RLS message straight into the sentence a customer
// reads ("...: duplicate key value violates unique constraint ..."). This turns
// a failed save into reassuring copy WITHOUT ever echoing that raw text.
//
// A dropped connection — common on a phone in a salon or on patchy signal —
// gets its own line: it's almost always transient, not the customer's fault,
// and their typed input is still on screen to retry. Everything else returns
// the caller's warm fallback verbatim.
// ============================================================

/** True when a failure looks like a lost/again-in-a-moment connection. */
export function isNetworkError(err?: unknown): boolean {
  // Strongest signal: the browser itself says we're offline.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  const raw =
    err && typeof err === "object" && "message" in err
      ? (err as { message?: unknown }).message
      : err;
  const msg = String(raw ?? "");
  // Supabase/fetch surface network drops as "TypeError: Failed to fetch",
  // "NetworkError", "Load failed" (Safari), timeouts, or dropped sockets.
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|connection (?:lost|closed|refused|reset)|offline|timed? ?out|etimedout|econn/i.test(
    msg,
  );
}

/**
 * Copy for a failed customer write. Never returns the raw error message.
 * @param err      the caught error / Supabase error object
 * @param fallback warm, specific copy for the non-network case
 */
export function friendlySaveError(err: unknown, fallback: string): string {
  if (isNetworkError(err)) {
    return "Looks like you’ve dropped offline — check your connection and try again. Don’t worry, nothing’s lost.";
  }
  return fallback;
}
