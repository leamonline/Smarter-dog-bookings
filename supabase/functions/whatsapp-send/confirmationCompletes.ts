// ============================================================
// A booking confirmation completes the conversation it lands in.
//
// Once Meta has accepted a booking_confirmed_v1 template, there is nothing
// left for staff to do in that thread, so whatsapp-send marks it complete
// instead of staff pressing "Mark complete" on every one. It writes the same
// columns as the inbox's resolveConversation (useConversationLifecycle.ts):
//
//   closed_at       now
//   closed_by       null — no person closed it; Mark complete stamps a user
//   closure_reason  'booking_confirmed_quiet' — the CHECK on the column
//                   (20260520200000) allows only manual / booking_confirmed_quiet
//                   / stale_30d / customer_cancelled, so the existing booking
//                   reason is reused rather than adding one by migration
//   closure_suggested_at / closure_suggested_reason  cleared
//
// The customer's next message reopens it through reopen_on_new_inbound, the
// same trigger that reopens a thread staff closed.
//
// A customer who asked for a person and has not been answered keeps the thread
// open. Closing supersedes every pending draft as `conversation_closed`, which
// the agent's openHandoffState reads as settled (#1070), so the request would
// otherwise end silently. A lookup that fails leaves the thread open too: that
// is how every thread behaved before, and staff can still close it themselves.
//
// Best effort: the confirmation has already gone, so nothing here fails the
// send.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Templates whose successful send completes the conversation. */
export const CONVERSATION_COMPLETING_TEMPLATES: ReadonlySet<string> = new Set(["booking_confirmed_v1"]);

export const CONFIRMATION_CLOSURE_REASON = "booking_confirmed_quiet";

/** As whatsapp-agent's HANDOFF_CARRY_DAYS: an older request was settled some other way. */
const HANDOFF_CARRY_DAYS = 14;

export type ConfirmationCompleteOutcome = "completed" | "already_closed" | "handoff_open" | "failed";

interface DraftRow {
  created_at: string;
  state: string;
  rejected_reason: string | null;
  handoff_required: boolean | null;
  tool_calls: Record<string, unknown> | null;
}

function isStopAcknowledgement(toolCalls: Record<string, unknown> | null): boolean {
  return String(toolCalls?.opt_out_acknowledgement) === "true";
}

/**
 * Whether a request for a person is still open on the conversation: a pending
 * handoff draft (not a STOP acknowledgement), or a handoff that only the
 * customer's next message superseded, with no staff reply since, which the agent
 * is carrying onto that message. Throws when a lookup fails.
 */
async function handoffStillOpen(supabase: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data: pending, error: pendingErr } = await supabase
    .from("whatsapp_drafts")
    .select("tool_calls")
    .eq("conversation_id", conversationId)
    .eq("state", "pending")
    .eq("handoff_required", true);
  if (pendingErr) throw new Error(`pending handoff lookup failed: ${pendingErr.message}`);
  if (((pending ?? []) as Pick<DraftRow, "tool_calls">[]).some((d) => !isStopAcknowledgement(d.tool_calls))) {
    return true;
  }

  const { data: latest, error: latestErr } = await supabase
    .from("whatsapp_drafts")
    .select("created_at, state, rejected_reason, handoff_required, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw new Error(`newest draft lookup failed: ${latestErr.message}`);
  const draft = latest as DraftRow | null;
  if (
    !draft?.handoff_required ||
    isStopAcknowledgement(draft.tool_calls) ||
    draft.state !== "superseded" ||
    draft.rejected_reason !== "newer_inbound" ||
    Date.now() - Date.parse(draft.created_at) > HANDOFF_CARRY_DAYS * 24 * 60 * 60 * 1000
  ) {
    return false;
  }

  // Counted from when the draft was saved, not from the customer's message as
  // the agent does: a reply in between is missed, so this errs towards open.
  const { data: staffReply, error: replyErr } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("raw->>sent_by", "staff")
    .gt("sent_at", draft.created_at)
    .limit(1)
    .maybeSingle();
  if (replyErr) throw new Error(`staff reply lookup failed: ${replyErr.message}`);
  return !staffReply;
}

export async function completeConversationAfterConfirmation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<ConfirmationCompleteOutcome> {
  try {
    if (await handoffStillOpen(supabase, conversationId)) {
      console.log(
        `whatsapp-send: booking confirmation left conversation ${conversationId} open: a request for a person is unanswered`,
      );
      return "handoff_open";
    }

    // Only while it is still open, so a closure staff already made keeps its
    // own closed_by and reason.
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .update({
        closed_at: new Date().toISOString(),
        closed_by: null,
        closure_reason: CONFIRMATION_CLOSURE_REASON,
        closure_suggested_at: null,
        closure_suggested_reason: null,
      })
      .eq("id", conversationId)
      .is("closed_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return "already_closed";
    console.log(`whatsapp-send: booking confirmation completed conversation ${conversationId}`);
    return "completed";
  } catch (err) {
    console.error(
      `whatsapp-send: completing conversation ${conversationId} after a booking confirmation failed (the confirmation was sent):`,
      err instanceof Error ? err.message : String(err),
    );
    return "failed";
  }
}
