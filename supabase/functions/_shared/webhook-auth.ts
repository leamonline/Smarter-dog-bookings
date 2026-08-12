// _shared/webhook-auth.ts — constant-time Bearer token check for our
// internal notify-* webhooks (called by pg_net from booking triggers).
//
// Replaces the per-function `authHeader !== \`Bearer ${WEBHOOK_SECRET}\``
// pattern, which used short-circuiting `===` and was therefore timing-
// observable: a network attacker could measure response-time distributions
// to recover the secret one character at a time. Constant-time compare
// closes that side channel.
//
// Note: this leaks the *length* of the expected header (early-exits when
// lengths differ). Acceptable here because (a) the expected length is a
// fixed constant per deployment and (b) WEBHOOK_SECRET is a high-entropy
// random secret — knowing its length doesn't materially reduce search space.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isAuthorizedWebhook(
  authHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!authHeader) return false;
  // Reject an empty/unset secret outright. Without this the comparison below
  // is `timingSafeEqual("Bearer ", "Bearer " + "")` — an exact match — so a
  // deployment that lost WEBHOOK_SECRET would authorise anyone who sent the
  // literal header "Bearer " (with the trailing space). Callers do each guard
  // this themselves (an early 500, or `!!WEBHOOK_SECRET &&`), so this is
  // defence in depth rather than a live hole; it belongs in the primitive so a
  // future caller cannot reintroduce it by forgetting the guard.
  if (!secret) return false;
  return timingSafeEqual(authHeader, `Bearer ${secret}`);
}

// Generic constant-time check for a header that should equal a stored
// secret (e.g. x-internal-secret, x-agent-secret). Returns false on
// any missing/empty input — including an empty `expected`, which would
// otherwise match an attacker who simply sent an empty header.
export function timingSafeEqualHeader(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}
