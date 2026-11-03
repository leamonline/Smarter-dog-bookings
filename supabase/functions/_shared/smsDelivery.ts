// ============================================================
// supabase/functions/_shared/smsDelivery.ts
//
// What a Twilio status callback means for a text we sent, and what to do about it.
//
// Twilio answers "send" with 2xx the moment it QUEUES a text, and every text used
// to be logged 'sent' on that alone. The real outcome arrives later as a status
// callback. Four outcomes matter and they are kept distinct:
//
//   accepted     Twilio has it (queued / sending / sent). Nothing to record.
//   delivered    the carrier confirmed it reached the handset.
//   undelivered  the carrier took it and could not deliver it (phone off for too
//                long, landline, blocked). Twilio says this after the fact.
//   failed       Twilio could not send it at all.
//
// Both bad outcomes mark the message and the log row failed, with a reason
// staff can read, and, when the text was ESSENTIAL (a confirmation, reminder,
// cancellation, collection notice) raise a staff to-do: "ring them".
//
// A 21610 is special: that number has texted STOP to us. It is recorded as an
// SMS opt-out and staff are flagged (smsStop.ts), and nothing is retried.
//
// Pure classification plus a small, injectable write path, so it is tested
// without a network. Best effort in the writes' failures only: the handler
// answers 500 for a database error so it is visible, never silently swallowed.
// ============================================================

// deno-lint-ignore-file no-explicit-any

import { isRecipientUnsubscribed, recordSmsStop } from "./smsStop.ts";
import { raiseFollowUpTodo } from "./staffFollowUp.ts";

export type SmsOutcome = "accepted" | "delivered" | "undelivered" | "failed" | "ignored";

/** Twilio's MessageStatus, as one of the four outcomes (or ignored: inbound, unknown). */
export function classifyTwilioStatus(status: string | null | undefined): SmsOutcome {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
    case "scheduled":
    case "queued":
    case "sending":
    case "sent":
      return "accepted";
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    default:
      return "ignored"; // receiving / received / canceled / anything new: never guess
  }
}

const ERROR_TEXT: Readonly<Record<string, string>> = {
  "21211": "that isn't a valid phone number",
  "21408": "texts to that country aren't switched on",
  "21610": "they've replied STOP to our texts",
  "21614": "that number can't receive texts (it may be a landline)",
  "30003": "their phone was off or out of signal",
  "30004": "their phone or network blocked it",
  "30005": "that number doesn't exist or is no longer in use",
  "30006": "that number can't receive texts (a landline, or the carrier can't deliver)",
  "30007": "their carrier filtered it as spam",
  "30008": "the carrier couldn't deliver it (unknown reason)",
};

/** A reason staff can act on, from a Twilio error code. Unknown codes keep the number so it can be looked up. */
export function describeTwilioError(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "no reason was given";
  return ERROR_TEXT[c] ?? `Twilio error ${c}`;
}

/** The line stored on the message and log row. "undelivered" and "failed" stay distinguishable. */
export function smsFailureLine(outcome: "undelivered" | "failed", code: string | null | undefined): string {
  const cause = describeTwilioError(code);
  return outcome === "undelivered"
    ? `Text not delivered: the carrier couldn't deliver it (${cause}).`
    : `Text failed to send: ${cause}.`;
}

/**
 * Whether a newer status may replace the stored one on the MESSAGE. Statuses can
 * arrive out of order, so one never moves backwards: a late "sent" must not undo
 * "delivered". Delivered is positive evidence, so it may replace a recorded
 * failure. A repeated failure is allowed through on purpose: every write behind it
 * is conditional and idempotent, so a callback whose first attempt died half way
 * (message marked, log not) is finished by Twilio's re-delivery instead of being
 * skipped as "already done".
 */
export function shouldApplyStatus(current: string | null | undefined, next: SmsOutcome): boolean {
  if (next === "ignored" || next === "accepted") return false; // already stored as 'sent'
  if (next === "delivered") return current !== "delivered" && current !== "read";
  return current !== "delivered" && current !== "read"; // a failure, until it is delivered
}

/** What an essential text was, for the staff to-do (no message content, ever). */
export function essentialKind(triggerType: string | null | undefined, content: string | null | undefined): string | null {
  const base = (triggerType ?? "").replace(/_sms_fallback$/, "");
  if (base === "reminder") return "reminder";
  if (base === "confirmed") return "booking confirmation";
  if (base === "cancelled") return "cancellation notice";
  if (base) return "booking notification";
  const template = /^\[template:([^\]]+)\]/.exec(content ?? "")?.[1] ?? "";
  if (/collection/i.test(template)) return "collection notice";
  if (template) return "notification";
  return null; // a free-text message typed by staff: they are looking at the inbox already
}

export interface SmsStatusEvent {
  sid: string;
  status: string;
  errorCode?: string | null;
  to?: string | null;
}

export interface SmsStatusResult {
  outcome: SmsOutcome;
  matched: boolean;
  updatedMessage: boolean;
  updatedLog: number;
  todo: "created" | "duplicate" | "skipped" | "failed" | "none";
  stopRecorded: boolean;
}

/**
 * Put log rows that were marked failed back to 'sent' (notification_log only knows
 * sent / failed / pending). Used whenever the text is known to have been delivered:
 * the message row is the truth, so this heals a log row that disagrees with it.
 * Conditional on 'failed', so it is safe to repeat.
 */
async function repairFailedLogs(supabase: any, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error } = await supabase
    .from("notification_log")
    .update({ status: "sent", error_message: null })
    .in("id", ids)
    .eq("status", "failed");
  if (error) throw new Error(`log repair failed: ${error.message ?? "unknown"}`);
  return ids.length;
}

/**
 * Apply one Twilio status callback. Safe to repeat: a re-delivered callback
 * changes nothing that is already done and finishes anything a crashed attempt
 * left undone.
 */
export async function applySmsStatus(supabase: any, event: SmsStatusEvent): Promise<SmsStatusResult> {
  const outcome = classifyTwilioStatus(event.status);
  const result: SmsStatusResult = {
    outcome,
    matched: false,
    updatedMessage: false,
    updatedLog: 0,
    todo: "none",
    stopRecorded: false,
  };
  if (outcome === "ignored" || outcome === "accepted") return result;

  const { data: message, error: msgErr } = await supabase
    .from("whatsapp_messages")
    .select("id, status, content, conversation_id")
    .eq("meta_message_id", event.sid)
    .eq("channel", "sms")
    .maybeSingle();
  if (msgErr) throw new Error(`message lookup failed: ${msgErr.message ?? "unknown"}`);

  const { data: logRows, error: logErr } = await supabase
    .from("notification_log")
    .select("id, human_id, trigger_type, status")
    .eq("provider_message_id", event.sid)
    .eq("channel", "sms");
  if (logErr) throw new Error(`log lookup failed: ${logErr.message ?? "unknown"}`);
  const logs: { id: string; human_id: string | null; trigger_type: string | null; status: string }[] = logRows ?? [];

  result.matched = Boolean(message) || logs.length > 0;
  if (!result.matched) return result; // not one of ours, or the row isn't written yet

  const current: string | null = message?.status ?? null;
  const failedLogIds = logs.filter((l) => l.status === "failed").map((l) => l.id);

  if (outcome === "delivered") {
    // Positive evidence wins everywhere. The message and the log are repaired
    // independently, so staff surfaces (inbox, booking delivery card) agree even
    // when the failure callback arrived first.
    if (message && shouldApplyStatus(current, outcome)) {
      const { error } = await supabase.from("whatsapp_messages").update({ status: "delivered", error_message: null }).eq("id", message.id);
      if (error) throw new Error(`message update failed: ${error.message ?? "unknown"}`);
      result.updatedMessage = true;
    }
    result.updatedLog = await repairFailedLogs(supabase, failedLogIds);
    return result;
  }

  if (!shouldApplyStatus(current, outcome)) {
    // Already delivered: never move backwards. But if a log row still says failed (an
    // earlier attempt died part-way), the delivered message is the truth: heal it, so a
    // retried failure callback ends consistent instead of exiting with the rows disagreeing.
    result.updatedLog = await repairFailedLogs(supabase, failedLogIds);
    return result;
  }

  const line = smsFailureLine(outcome, event.errorCode);
  if (message) {
    // The ordering rule is enforced IN the database: two callbacks can both have read
    // 'sent', so a JavaScript check alone would let a late failure overwrite
    // 'delivered'. Only when this update really changed a row do we go on to the
    // side effects; zero rows means a delivery got there first.
    const { data: changed, error } = await supabase
      .from("whatsapp_messages")
      .update({ status: "failed", error_message: line })
      .eq("id", message.id)
      .not("status", "in", "(delivered,read)")
      .select("id");
    if (error) throw new Error(`message update failed: ${error.message ?? "unknown"}`);
    if (!Array.isArray(changed) || changed.length === 0) return result;
    result.updatedMessage = true;
  }
  // Each remaining step is derived from current state and safe to repeat (the log
  // update is conditional on 'sent', STOP recording on not-yet-opted-out, the to-do
  // is deduplicated), so a retry after a partial failure completes what is missing.
  const sentLogIds = logs.filter((l) => l.status === "sent").map((l) => l.id);
  if (sentLogIds.length > 0) {
    const { error } = await supabase
      .from("notification_log")
      .update({ status: "failed", error_message: line })
      .in("id", sentLogIds)
      .eq("status", "sent");
    if (error) throw new Error(`log update failed: ${error.message ?? "unknown"}`);
    result.updatedLog = sentLogIds.length;
  }

  // Close the window a concurrent delivery can slip into: it may have landed after our
  // guarded message update but before this log update, and would then have found
  // nothing to repair. Look again; if the text was delivered, undo the log change and
  // raise nothing. (A single database transaction would close this completely; a
  // delivery that lands after this check can still leave one avoidable alert, which
  // staff will see as a text that did arrive.)
  if (message) {
    const { data: now, error: nowErr } = await supabase
      .from("whatsapp_messages")
      .select("status")
      .eq("id", message.id)
      .maybeSingle();
    if (nowErr) throw new Error(`message re-check failed: ${nowErr.message ?? "unknown"}`);
    if (now?.status === "delivered" || now?.status === "read") {
      await repairFailedLogs(supabase, sentLogIds);
      result.updatedLog = 0;
      return result;
    }
  }

  // A text STOP: record it and flag staff. recordSmsStop raises its own to-do.
  if (isRecipientUnsubscribed(event.errorCode)) {
    if (event.to) {
      const stop = await recordSmsStop(supabase, event.to);
      // Raise so the handler answers 500 and Twilio re-delivers: every step above is
      // already applied and the ones below are safe to repeat.
      if (stop.failed) throw new Error("STOP could not be recorded");
    }
    result.stopRecorded = Boolean(event.to);
    result.todo = "skipped";
    return result;
  }

  // An essential text that did not arrive is something staff can act on.
  const kind = essentialKind(logs[0]?.trigger_type, message?.content);
  if (!kind) return result;

  // One alert per TEXT, however old and whether or not staff have since ticked it
  // off: the Twilio SID rides on the to-do ("Ref SM..."), so a replayed callback
  // can't resurrect work that was already done. (raiseFollowUpTodo's own check only
  // sees open tasks from the last few hours.) A genuinely failed insert leaves no
  // marker behind, so a retry still creates it.
  const { data: prior, error: priorErr } = await supabase
    .from("salon_todos")
    .select("id")
    .like("text", `%(Ref ${event.sid})%`)
    .limit(1);
  if (priorErr) throw new Error(`alert lookup failed: ${priorErr.message ?? "unknown"}`);
  if (Array.isArray(prior) && prior.length > 0) {
    result.todo = "duplicate";
    return result;
  }

  let humanId: string | null = logs.find((l) => l.human_id)?.human_id ?? null;
  if (!humanId && message?.conversation_id) {
    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("human_id")
      .eq("id", message.conversation_id)
      .maybeSingle();
    // A failed lookup is not "an unlinked conversation": raise, so the callback is retried.
    if (convErr) throw new Error(`conversation lookup failed: ${convErr.message ?? "unknown"}`);
    humanId = conv?.human_id ?? null;
  }
  result.todo = await raiseFollowUpTodo(supabase, humanId, "sms_undelivered", {
    reply: "none",
    detail: `${kind} text (${describeTwilioError(event.errorCode)})`,
    ref: event.sid,
  });
  if (result.todo === "failed") throw new Error("staff to-do could not be created");
  return result;
}
