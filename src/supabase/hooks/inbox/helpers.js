// Shared helpers for the useWhatsAppInbox surface. Extracted from the
// monolithic hook so smaller sub-hooks (useOutboundSender etc.) can
// reuse them without dragging the rest of the inbox state along.

// Edge function name. Hardcoded so a typo in one of the seven
// invoke() callers can't quietly drift away from the others. If the
// function ever gets renamed in a migration, this is the one line
// that changes.
export const SEND_FUNCTION_PATH = "whatsapp-send";

// Supabase wraps non-2xx responses from edge functions in
// FunctionsHttpError. The actual JSON payload is hidden behind
// error.context.json(); pull it out so error toasts and Sentry tags
// surface the real reason ("Twilio template not approved" beats
// "Function returned a non-2xx status code").
export async function parseSupabaseFunctionError(error, fallbackMessage) {
  let detail = error.message ?? fallbackMessage;
  try {
    const errorBody = await error.context?.json?.();
    if (errorBody) {
      const parts = [errorBody.error, errorBody.detail].filter(Boolean);
      if (parts.length) detail = parts.join(": ");
    }
  } catch {
    /* fall through */
  }
  return detail;
}
