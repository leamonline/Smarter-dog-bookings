// Supabase writes for Messenger ingress. Service role only — the webhook
// has no staff session. Phone columns are never filled.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { MessengerStore, StoredConversation } from "./messenger.ts";

function duplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export function createMessengerStore(supabase: SupabaseClient): MessengerStore {
  return {
    async findIdentityHumanId(pageId, psid) {
      const { data, error } = await supabase
        .from("messaging_identities")
        .select("human_id")
        .eq("channel", "messenger")
        .eq("page_id", pageId)
        .eq("psid", psid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.human_id as string | undefined) ?? null;
    },

    async findConversation(pageId, psid) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("id, human_id")
        .eq("channel", "messenger")
        .eq("messenger_page_id", pageId)
        .eq("messenger_psid", psid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { id: data.id as string, human_id: (data.human_id as string | null) ?? null };
    },

    async insertConversation(row) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .insert({
          channel: "messenger",
          phone_e164: null,
          messenger_page_id: row.pageId,
          messenger_psid: row.psid,
          human_id: row.humanId,
          state: "human_takeover",
          auto_send_enabled: false,
          autonomous_booking_enabled: false,
          last_inbound_at: row.lastInboundAt,
          last_customer_text: row.lastCustomerText,
        })
        .select("id, human_id")
        .single();
      if (error) {
        if (duplicate(error)) {
          const existing = await this.findConversation(row.pageId, row.psid);
          if (existing) return existing;
        }
        throw new Error(error.message);
      }
      return { id: data.id as string, human_id: (data.human_id as string | null) ?? null };
    },

    async noteInbound(id, lastInboundAt, lastCustomerText, humanIdToFill) {
      const patch: Record<string, unknown> = { last_inbound_at: lastInboundAt, last_customer_text: lastCustomerText };
      if (humanIdToFill) patch.human_id = humanIdToFill;
      const { error } = await supabase.from("whatsapp_conversations").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async hasMessage(direction, mid) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("direction", direction)
        .eq("meta_message_id", mid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },

    async insertMessage(row) {
      const { error } = await supabase.from("whatsapp_messages").insert({
        conversation_id: row.conversationId,
        direction: row.direction,
        role: row.direction === "inbound" ? "user" : "assistant",
        meta_message_id: row.mid,
        content: row.content,
        raw: row.raw,
        status: row.status,
        sent_at: row.sentAt,
        channel: "messenger",
      });
      if (error) {
        if (duplicate(error)) return "duplicate";
        throw new Error(error.message);
      }
      return "inserted";
    },

    async noteOutbound(conversationId, sentAt) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ last_outbound_at: sentAt })
        .eq("id", conversationId);
      if (error) throw new Error(error.message);
    },

    async markDelivered(mids, atIso) {
      if (mids.length === 0) return;
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ status: "delivered", delivered_at: atIso })
        .in("meta_message_id", mids)
        .eq("direction", "outbound")
        .eq("channel", "messenger")
        .neq("status", "read");
      if (error) throw new Error(error.message);
    },

    async markReadBefore(conversationId, watermarkIso) {
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ status: "read", read_at: watermarkIso })
        .eq("conversation_id", conversationId)
        .eq("direction", "outbound")
        .eq("channel", "messenger")
        .lte("sent_at", watermarkIso)
        .in("status", ["sent", "delivered"]);
      if (error) throw new Error(error.message);
    },
  };
}

export type { StoredConversation };
