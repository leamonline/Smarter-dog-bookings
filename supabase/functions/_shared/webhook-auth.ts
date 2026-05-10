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
  return timingSafeEqual(authHeader, `Bearer ${secret}`);
}
