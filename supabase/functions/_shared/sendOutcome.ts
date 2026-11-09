// ============================================================
// supabase/functions/_shared/sendOutcome.ts
//
// What happened to an outbound message at the provider (Twilio, Meta)?
//
// A send has THREE honest answers, and callers must not collapse them:
//
//   accepted  the provider returned a message id; it is on its way.
//   rejected  the provider answered and said no (an HTTP 4xx with a JSON
//             error body, or 429). Nothing was created, so a fix and a retry
//             is safe.
//   unknown   we cannot tell. The request may have reached the provider and
//             the message may be on its way: a network failure or timeout, a
//             5xx, a 2xx with no message id, an unreadable body. Resending
//             risks a duplicate, so nothing may retry or fall through to
//             another channel on its own, and nothing may claim it was sent.
//
// This is the single place that rule lives. Both providers' senders and every
// caller that decides "try the next channel?" read it from here.
// ============================================================

export type SendOutcome = "accepted" | "rejected" | "unknown";

/**
 * notification_log.status only allows sent | failed | pending, and migrations
 * are applied by hand, so an unknown outcome is stored as `failed` with an
 * error_message that STARTS with this prefix. The hourly SMS chase and the
 * cancellation cascade skip such rows (a chase would text a customer whose
 * WhatsApp may have arrived: an unknown send has no message id for a delivery
 * receipt to match).
 */
export const UNKNOWN_OUTCOME_PREFIX = "outcome unknown:";

/** Shown to staff verbatim. A full sentence: old clients print `error` as is. */
export const UNKNOWN_OUTCOME_TEXT =
  "We couldn't confirm whether this message was sent. Check the thread or the customer's phone before sending again.";

/** Definitely not sent, and not the provider's decision: our own configuration. */
export class ProviderNotConfiguredError extends Error {
  readonly kind = "not_configured" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

/** The provider answered and refused. Nothing was created. */
export class ProviderRejectedError extends Error {
  readonly kind = "rejected" as const;
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProviderRejectedError";
    this.status = status;
  }
}

/** We cannot say whether the message was sent. */
export class ProviderOutcomeUnknownError extends Error {
  readonly kind = "unknown" as const;
  constructor(message: string) {
    super(message);
    this.name = "ProviderOutcomeUnknownError";
  }
}

export interface ProviderResponseFacts {
  /** HTTP 2xx. */
  ok: boolean;
  status: number;
  /** The body was valid JSON. */
  jsonParsed: boolean;
  /** The body carried the provider's message id (Twilio `sid`, Meta `messages[0].id`). */
  hasMessageId: boolean;
}

/**
 * Classify a provider HTTP response. Conservative by design: only a 2xx that
 * names a message is `accepted`, and only an answer that clearly refused is
 * `rejected`. Everything else is `unknown`.
 *
 * 429 (rate limit) is treated as `rejected`: the request was refused before a
 * message was created. This is an assumption about both providers; the tests
 * pin it so a change is deliberate.
 */
export function classifyProviderResponse(facts: ProviderResponseFacts): SendOutcome {
  if (facts.ok) return facts.hasMessageId ? "accepted" : "unknown";
  if (facts.status === 429) return "rejected";
  // A 4xx with a readable JSON error is the provider saying no. A 4xx we could
  // not read (a proxy page, say) is not evidence of anything.
  if (facts.status >= 400 && facts.status < 500) return facts.jsonParsed ? "rejected" : "unknown";
  return "unknown";
}

/** Did a send function's response body say the outcome is unknown? */
export function isUnknownOutcomeBody(body: unknown): boolean {
  return typeof body === "object" && body !== null &&
    (body as { outcome?: unknown }).outcome === "unknown";
}

/** The error_message for a notification_log row whose send outcome is unknown. */
export function unknownOutcomeLogMessage(detail?: string): string {
  const extra = detail?.trim();
  return extra ? `${UNKNOWN_OUTCOME_PREFIX} ${extra}` : `${UNKNOWN_OUTCOME_PREFIX} the provider's answer was lost, so the message may have been sent.`;
}

/** Does a notification_log error_message mark an unknown outcome? */
export function isUnknownOutcomeLogMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && message.startsWith(UNKNOWN_OUTCOME_PREFIX);
}

export interface SendCallResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/**
 * Having called whatsapp-send or sms-send, may the message have gone out?
 *
 * Only an answer that proves nothing was sent says no: the function's own
 * `outcome: "not_sent"`, or a 4xx (refused at the door: authorisation,
 * validation, opt-out, a closed window). Everything else that is not a clean
 * success could have happened after the provider took the message: a 5xx
 * with no body, a call that timed out (status 0), a gateway page. Callers use
 * this to decide whether falling through to another channel is safe, and
 * whether to mark a log row with UNKNOWN_OUTCOME_PREFIX.
 *
 * A 2xx that is not `ok: true` (or an `ok: true` with no message id, which the
 * send functions now report as unknown) is treated as may-have-gone too.
 */
export function sendCallMayHaveGone(result: SendCallResult): boolean {
  if (isUnknownOutcomeBody(result.body)) return true;
  if (result.body?.outcome === "not_sent") return false;
  if (result.status >= 400 && result.status < 500) return false;
  if (result.ok && result.body?.ok === true) return false; // accepted: handled as a success
  return true;
}

/**
 * Having called a send function and NOT got a clean success with a message id,
 * may the message still have gone out? This is the one question every caller
 * that logs a failure or considers another channel asks. It is
 * sendCallMayHaveGone() plus the case a caller reaches only when it requires a
 * message id: `ok: true` with none, which is a provider that took the message
 * and did not name it.
 */
export function failedSendMayHaveGone(result: SendCallResult): boolean {
  return sendCallMayHaveGone(result) || (result.ok && result.body?.ok === true);
}
