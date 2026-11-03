// ============================================================
// supabase/functions/_shared/smsStop.ts
//
// What happens when a customer's number says STOP to our TEXTS.
//
// Twilio enforces carrier STOP at its own layer: once a number has texted STOP
// it refuses every further message with error 21610. Nothing here receives an
// inbound text (there is no inbound Twilio route), so until now the first sign
// was a send quietly logged as "failed", the customer stayed ticked as
// reachable, and every later reminder failed the same way unseen.
//
// sms-send now recognises 21610, records the opt-out on every customer record
// with that number (an opt-out belongs to the number, as on WhatsApp), and
// raises a staff to-do so someone rings to clarify which channels are
// permitted. It never retries on another channel itself: a STOP is not
// overridden automatically (channelPolicy.ts).
//
// Best effort throughout: the caller has already decided what to answer, and a
// bookkeeping failure must not turn a refused text into a crash.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { phoneMatchKey, phoneMatchPattern } from "./optOut.ts";
import { raiseFollowUpTodo } from "./staffFollowUp.ts";

/** Twilio: "Attempt to send to unsubscribed recipient". */
export const TWILIO_RECIPIENT_UNSUBSCRIBED = "21610";

/** humans.sms_opted_out_reason when the number itself said STOP to our texts. */
export const SMS_STOP_REASON = "asked_on_sms";

export function isRecipientUnsubscribed(errorCode: string | null | undefined): boolean {
  return errorCode === TWILIO_RECIPIENT_UNSUBSCRIBED;
}

/**
 * Opt out every customer record whose phone IS this number and flag each for
 * staff. Returns how many records were on the number (0 for an unknown number,
 * which still leaves Twilio's own suppression in place).
 */
export async function recordSmsStop(
  supabase: any,
  phoneE164: string,
  now: Date = new Date(),
): Promise<{ onNumber: number }> {
  try {
    const pattern = phoneMatchPattern(phoneE164);
    if (!pattern) return { onNumber: 0 };

    const { data, error } = await supabase
      .from("humans")
      .select("id, phone")
      .filter("phone", "match", pattern);
    if (error) throw error;

    const key = phoneMatchKey(phoneE164);
    const ids: string[] = ((data ?? []) as { id: string; phone: string | null }[])
      .filter((row) => phoneMatchKey(row.phone) === key)
      .map((row) => row.id);
    if (ids.length === 0) return { onNumber: 0 };

    const { error: updateErr } = await supabase
      .from("humans")
      .update({
        sms_opted_out: true,
        sms_opted_out_at: now.toISOString(),
        sms_opted_out_reason: SMS_STOP_REASON,
      })
      .in("id", ids)
      .eq("sms_opted_out", false);
    if (updateErr) throw updateErr;

    await Promise.all(
      ids.map((id) => raiseFollowUpTodo(supabase, id, "stopped_sms", { reply: "none", now })),
    );
    return { onNumber: ids.length };
  } catch (err) {
    console.error(
      "recordSmsStop failed (non-fatal):",
      err instanceof Error ? err.message : JSON.stringify(err),
    );
    return { onNumber: 0 };
  }
}
