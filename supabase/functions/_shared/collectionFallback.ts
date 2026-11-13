// ============================================================
// supabase/functions/_shared/collectionFallback.ts
//
// When a "ready for collection" WhatsApp notice fails, text it instead.
//
// Staff send the notice from the collection modal as the Meta template
// ready_for_collection_v2. Meta accepts it, the modal says "sent" and closes.
// If the number turns out not to be reachable on WhatsApp, the failure only
// arrives afterwards, as a delivery status on the webhook, and nobody is
// looking at that thread: the owner is never told their dog is ready.
//
// The hourly reminder-sms-fallback is no use here. "Ready in 15 mins" is stale
// long before an hourly job runs. So the chase happens at once, from the
// status handler in whatsapp-agent, and only while the notice is still fresh.
//
// Rules:
//   - only the collection template, and only on a FAILED status;
//   - once per WhatsApp message: the caller claims the message's first move to
//     'failed' atomically, so a status Meta delivers twice texts once;
//   - not if the notice is older than FRESH_MINUTES: a late "ready in 15 mins"
//     would mislead, and staff see the failure in the inbox instead;
//   - not if a collection text already went to that number in the same window
//     (staff sent one by hand, or pressed Retry and that failed too);
//   - opt-outs are not decided here: sms-send refuses an opted-out or
//     untextable number for every caller, and this goes through sms-send.
//
// Pure decisions plus one IO function with its dependencies injected, so it
// runs under `deno test` with no network.
// ============================================================

// deno-lint-ignore-file no-explicit-any

export const COLLECTION_TEMPLATE = "ready_for_collection_v2";
/** The name the SMS is logged under in the inbox thread, same as the modal's. */
export const COLLECTION_SMS_TEMPLATE = "ready_for_collection_sms";
/** How long after sending a failed notice is still worth texting. */
export const FRESH_MINUTES = 30;

/**
 * The SMS wording. One place for the modal and this fallback, so the two can
 * never drift. Plain text, no emoji (keeps one dog within a single GSM-7
 * segment), and it names the salon because a text from an unknown number has
 * to say who it is from. `dogs` is the names already joined ("Bella and Max").
 */
export function collectionSmsText(dogs: string, minutes: string): string {
  return `Hi! We've finished pampering ${dogs || "your dog"} and they're ready to head home in ${minutes} mins. See you soon! X - Smarter Dog Grooming`;
}

export interface FailedNotice {
  /** whatsapp_messages.content, e.g. "[template:ready_for_collection_v2] Bella · 15". */
  content: string | null | undefined;
  /** whatsapp_messages.sent_at (ISO). */
  sentAt: string | null | undefined;
}

export type FallbackPlan =
  | { send: true; text: string }
  | { send: false; reason: "not_collection_notice" | "unreadable" | "stale" };

/**
 * Should this failed WhatsApp message be texted, and with what words?
 * whatsapp-send stores a template as "[template:<name>] <param> · <param>", so
 * the dog names and the minutes are read back from there. Anything that does
 * not parse cleanly is left alone rather than texted with a gap in it.
 */
export function planCollectionFallback(notice: FailedNotice, now: Date): FallbackPlan {
  const prefix = `[template:${COLLECTION_TEMPLATE}] `;
  const content = notice.content ?? "";
  if (!content.startsWith(prefix)) return { send: false, reason: "not_collection_notice" };

  const parts = content.slice(prefix.length).split(" · ");
  const dogs = (parts[0] ?? "").trim();
  const minutes = (parts[1] ?? "").trim();
  if (parts.length !== 2 || !dogs || !/^\d{1,3}$/.test(minutes)) {
    return { send: false, reason: "unreadable" };
  }

  const sent = notice.sentAt ? Date.parse(notice.sentAt) : NaN;
  if (!Number.isFinite(sent) || now.getTime() - sent > FRESH_MINUTES * 60_000) {
    return { send: false, reason: "stale" };
  }
  return { send: true, text: collectionSmsText(dogs, minutes) };
}

export type FallbackOutcome =
  | "not_first_failure"
  | "not_collection_notice"
  | "unreadable"
  | "stale"
  | "no_number"
  | "already_texted"
  | "sent"
  | "send_failed";

export interface FallbackDeps {
  supabase: any;
  /** POSTs to sms-send as an internal caller. Resolves ok=false rather than throwing. */
  sendSms: (body: Record<string, unknown>) => Promise<{ ok: boolean; detail?: string }>;
  now?: () => Date;
  log?: (message: string) => void;
}

/**
 * Called for every FAILED delivery status, BEFORE the status handler writes
 * 'failed' itself: the first query marks the message failed (with the
 * provider's errors) and proves this is the first time, in one statement. Never throws: a fault here must
 * not stop the status being recorded.
 */
export async function chaseFailedCollectionNotice(
  metaMessageId: string,
  /** The provider's errors, serialised exactly as the status handler stores them. */
  errorMessage: string,
  deps: FallbackDeps,
): Promise<FallbackOutcome> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  const now = (deps.now ?? (() => new Date()))();
  try {
    // The claim. Only the first transition to 'failed' returns a row. The
    // provider's errors are written in the SAME statement: a database trigger
    // copies error_message to notification_log on that first transition (for
    // every template, not just this one), so writing the status alone here
    // would replace the real failure reason with a generic one for good.
    const { data: claimed, error: claimErr } = await deps.supabase
      .from("whatsapp_messages")
      .update({ status: "failed", error_message: errorMessage })
      .eq("meta_message_id", metaMessageId)
      .eq("direction", "outbound")
      .neq("status", "failed")
      .select("id, content, sent_at, conversation_id");
    if (claimErr) {
      log(`collection fallback: claim failed for ${metaMessageId}: ${claimErr.message}`);
      return "not_first_failure";
    }
    const message = (claimed ?? [])[0];
    if (!message) return "not_first_failure";

    const plan = planCollectionFallback({ content: message.content, sentAt: message.sent_at }, now);
    if (!plan.send) return plan.reason;

    const { data: conversation } = await deps.supabase
      .from("whatsapp_conversations")
      .select("phone_e164, human_id")
      .eq("id", message.conversation_id)
      .maybeSingle();
    if (!conversation?.phone_e164) return "no_number";

    // A collection text already sent to this number, inside the window: staff
    // sent one by hand, or an earlier failed attempt was already chased. Texts
    // are NOT in the WhatsApp thread: sms-send records them in the number's own
    // SMS conversation (phone_e164 + channel 'sms'), so that is where to look.
    // If either lookup fails we can't tell, and don't risk a second text.
    const { data: smsThread, error: smsThreadErr } = await deps.supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("phone_e164", conversation.phone_e164)
      .eq("channel", "sms")
      .maybeSingle();
    if (smsThreadErr) {
      log(`collection fallback: SMS thread lookup failed for ${metaMessageId}: ${smsThreadErr.message}`);
      return "already_texted";
    }
    if (smsThread?.id) {
      const since = new Date(now.getTime() - FRESH_MINUTES * 60_000).toISOString();
      const { data: earlier, error: earlierErr } = await deps.supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("conversation_id", smsThread.id)
        .eq("direction", "outbound")
        .like("content", `[template:${COLLECTION_SMS_TEMPLATE}]%`)
        .gte("sent_at", since)
        .limit(1);
      if (earlierErr) {
        log(`collection fallback: earlier-text check failed for ${metaMessageId}: ${earlierErr.message}`);
        return "already_texted";
      }
      if ((earlier ?? []).length > 0) return "already_texted";
    }

    const result = await deps.sendSms({
      mode: "template",
      to: conversation.phone_e164,
      text: plan.text,
      template_name: COLLECTION_SMS_TEMPLATE,
      human_id: conversation.human_id ?? null,
    });
    if (!result.ok) {
      log(`collection fallback: SMS not sent for ${metaMessageId}: ${result.detail ?? "unknown"}`);
      return "send_failed";
    }
    return "sent";
  } catch (err) {
    log(`collection fallback: threw for ${metaMessageId}: ${err instanceof Error ? err.message : String(err)}`);
    return "send_failed";
  }
}
