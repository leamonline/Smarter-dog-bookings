// ============================================================
// supabase/functions/_shared/sendIdentity.ts
//
// Do the pieces of an outbound send agree with each other? A send names up to
// four things (the endpoint's channel, a destination number, a customer, a
// conversation to record on), and nothing used to check that they describe the
// same person on the same channel. The result was a reply typed in an SMS
// thread going out over WhatsApp, and a template recorded on whichever
// conversation id the caller supplied.
//
// OBSERVE-ONLY. Stage 1, PR A reports disagreements and refuses nothing:
// they come back as stable codes in the success response's `warnings`, and
// are logged (ids and codes only, never a number or a name). That gives the
// enforcing change (PR C) the evidence it needs, and tells us what the client
// change (PR B) has fixed. A lookup that fails is logged and skipped: this
// code must never be the reason a message does not go out.
// ============================================================

import { phoneMatchKey } from "./optOut.ts";

export type SendChannel = "whatsapp" | "sms";

export type IdentityCode =
  | "human_not_found"
  | "human_phone_invalid"
  | "invalid_phone"
  | "human_phone_mismatch"
  | "conversation_not_found"
  | "conversation_channel_mismatch"
  | "conversation_phone_mismatch"
  | "conversation_human_conflict";

export interface IdentityFacts {
  endpointChannel: SendChannel;
  /** The destination number the caller supplied; absent when it is derived from the conversation. */
  to?: string | null;
  humanId?: string | null;
  /** undefined: not looked up. null: looked up and not found. */
  human?: { phone: string | null } | null;
  conversationId?: string | null;
  /** undefined: not looked up. null: looked up and not found. */
  conversation?: { channel: string | null; phone_e164: string | null; human_id: string | null } | null;
}

/** Pure: every disagreement in the facts, in a stable order. */
export function checkSendIdentity(f: IdentityFacts): IdentityCode[] {
  const codes: IdentityCode[] = [];
  const toKey = f.to ? phoneMatchKey(f.to) : null;

  if (f.to && !toKey) codes.push("invalid_phone");

  if (f.humanId && f.human === null) {
    codes.push("human_not_found");
  } else if (f.humanId && f.human) {
    const humanKey = phoneMatchKey(f.human.phone);
    if (!humanKey) codes.push("human_phone_invalid");
    else if (toKey && toKey !== humanKey) codes.push("human_phone_mismatch");
  }

  if (f.conversationId && f.conversation === null) {
    codes.push("conversation_not_found");
  } else if (f.conversationId && f.conversation) {
    // A row with no channel predates the column: WhatsApp.
    const channel = f.conversation.channel ?? "whatsapp";
    if (channel !== f.endpointChannel) codes.push("conversation_channel_mismatch");
    const convKey = phoneMatchKey(f.conversation.phone_e164);
    if (toKey && convKey && toKey !== convKey) codes.push("conversation_phone_mismatch");
    if (f.humanId && f.conversation.human_id && f.humanId !== f.conversation.human_id) {
      codes.push("conversation_human_conflict");
    }
  }
  return codes;
}

type LookupResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
/** The one query shape the observer uses: from().select().eq().maybeSingle(). */
export interface IdentityDb {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): { maybeSingle(): LookupResult } };
  };
}

export interface ObserveInput {
  endpoint: "whatsapp-send" | "sms-send";
  endpointChannel: SendChannel;
  mode: string;
  to?: string | null;
  humanId?: string | null;
  conversationId?: string | null;
  /** whatsapp-send draft mode: the conversation is the draft's. */
  draftId?: string | null;
}

/**
 * Look up what the request names and report any disagreement. Never throws and
 * never blocks: on a failed lookup it logs and reports only what it could see.
 */
export async function observeSendIdentity(db: IdentityDb, input: ObserveInput): Promise<IdentityCode[]> {
  try {
    let conversationId = input.conversationId ?? null;
    if (!conversationId && input.draftId) {
      const { data, error } = await db.from("whatsapp_drafts").select("conversation_id").eq("id", input.draftId).maybeSingle();
      if (error) throw new Error(error.message);
      conversationId = (data as { conversation_id?: string | null } | null)?.conversation_id ?? null;
    }

    const facts: IdentityFacts = {
      endpointChannel: input.endpointChannel,
      to: input.to,
      humanId: input.humanId,
      conversationId,
    };

    if (input.humanId) {
      const { data, error } = await db.from("humans").select("phone").eq("id", input.humanId).maybeSingle();
      if (error) throw new Error(error.message);
      facts.human = (data as { phone: string | null } | null) ?? null;
    }
    if (conversationId) {
      const { data, error } = await db
        .from("whatsapp_conversations")
        .select("channel, phone_e164, human_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      facts.conversation = (data as IdentityFacts["conversation"]) ?? null;
    }

    const codes = checkSendIdentity(facts);
    if (codes.length > 0) {
      // Ids and codes only: no number, name or message text.
      console.warn(JSON.stringify({
        event: "send_identity_observed",
        endpoint: input.endpoint,
        mode: input.mode,
        codes,
        conversation_id: conversationId,
        human_id: input.humanId ?? null,
      }));
    }
    return codes;
  } catch (err) {
    console.error(`${input.endpoint}: identity observation skipped:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}
