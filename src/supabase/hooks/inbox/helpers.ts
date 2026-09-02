// Shared helpers for the useWhatsAppInbox surface. Extracted from the
// monolithic hook so smaller sub-hooks (useOutboundSender etc.) can
// reuse them without dragging the rest of the inbox state along.

// Edge function name. Hardcoded so a typo in one of the seven
// invoke() callers can't quietly drift away from the others. If the
// function ever gets renamed in a migration, this is the one line
// that changes.
export const SEND_FUNCTION_PATH = "whatsapp-send";

/** The outcome shape every inbox action returns. */
export type InboxActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

/**
 * What supabase-js hands back for a failed edge-function invoke: an Error
 * whose `context` is the Response, so the JSON body must be read off it.
 * Typed structurally so tests can pass a plain object.
 */
interface FunctionErrorLike {
  message?: string;
  context?: { json?: () => Promise<unknown> };
}

interface FunctionErrorBody {
  error?: unknown;
  reason?: unknown;
  detail?: unknown;
}

// Supabase wraps non-2xx responses from edge functions in
// FunctionsHttpError. The actual JSON payload is hidden behind
// error.context.json(); pull it out so error toasts and Sentry tags
// surface the real reason ("Twilio template not approved" beats
// "Function returned a non-2xx status code").
//
// Edge functions in this repo use {error, detail} on most paths and
// {error, reason} on whatsapp-generate-reply specifically. Try all
// three keys so the shared helper covers both shapes.
export async function parseSupabaseFunctionError(
  error: FunctionErrorLike,
  fallbackMessage: string,
): Promise<string> {
  let detail = error.message ?? fallbackMessage;
  try {
    const errorBody = (await error.context?.json?.()) as FunctionErrorBody | null | undefined;
    if (errorBody) {
      const parts = [
        errorBody.error,
        errorBody.reason,
        errorBody.detail,
      ].filter(Boolean);
      if (parts.length) detail = parts.join(": ");
    }
  } catch {
    /* fall through */
  }
  return detail;
}
