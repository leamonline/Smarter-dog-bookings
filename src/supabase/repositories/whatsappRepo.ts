// WhatsApp repository: read-side queries over whatsapp_messages that the
// inbox hooks used to run against the client directly (Debt #12).
import type { SupabaseClient } from "@supabase/supabase-js";

// Escape the LIKE wildcards so a query containing % or _ matches those
// characters literally rather than acting as a pattern.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Conversation ids with at least one message whose content matches the
 * free-text query (case-insensitive substring). Bounded by `limit` rows so
 * a very common word can't pull thousands of message rows over the wire.
 */
export async function searchMessageConversationIds(
  client: SupabaseClient,
  query: string,
  limit: number,
): Promise<{ conversationIds: string[]; error: Error | null }> {
  const { data, error } = await client
    .from("whatsapp_messages")
    .select("conversation_id")
    .ilike("content", `%${escapeLike(query)}%`)
    .limit(limit);
  const rows = (data ?? []) as Array<{ conversation_id: string | null }>;
  return {
    conversationIds: rows.map((row) => row.conversation_id).filter((id): id is string => Boolean(id)),
    error: error ?? null,
  };
}
