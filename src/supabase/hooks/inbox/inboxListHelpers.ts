/**
 * inboxListHelpers — pure helpers behind the staff WhatsApp inbox list
 * (Debt 6; split out of useWhatsAppInbox.ts, which re-exports them so the
 * existing tests and importers are unchanged).
 */

// Filters the bookingActions list down to the actions attached to the
// current pending draft. An action is "attached" if its draft_id
// matches the draft's id AND it's still pending. Used by the inbox
// hook to withhold DraftPanel reply controls while a booking proposal
// is hanging off the same draft.
export function filterAttachedActions<A extends { draft_id: string | null; state: string }>(
  draft: { id: string } | null | undefined,
  bookingActions: ReadonlyArray<A> | null | undefined,
): A[] {
  if (!draft) return [];
  if (!Array.isArray(bookingActions)) return [];
  return bookingActions.filter(
    (a) => a.draft_id === draft.id && a.state === "pending",
  );
}

export function latestMessagesChronological<T>(rows: ReadonlyArray<T> | null | undefined): T[] {
  return [...(rows ?? [])].reverse();
}

export function getSelectedConversationForSend<C extends { id: string }>(
  conversations: ReadonlyArray<C>,
  selectedId: string | null | undefined,
): C {
  const conversation = conversations.find((c) => c.id === selectedId);
  if (!conversation) {
    throw new Error("Selected conversation is no longer available");
  }
  return conversation;
}

export function mergeFailedMessageFlags<
  C extends { id: string; last_outbound_at?: string | null },
  M extends { conversation_id?: string | null; sent_at?: string | null },
>(
  conversations: ReadonlyArray<C> | null | undefined,
  failedMessages: ReadonlyArray<M> | null | undefined,
): Array<C & { has_failed_message: boolean; latest_failed_message: M | null }> {
  const latestByConversation = new Map<string, M>();
  for (const message of failedMessages ?? []) {
    if (!message?.conversation_id) continue;
    const current = latestByConversation.get(message.conversation_id);
    if (!current || String(message.sent_at || "") > String(current.sent_at || "")) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  return (conversations ?? []).map((conversation) => {
    const latest = latestByConversation.get(conversation.id) ?? null;
    // Only flag the conversation while the failure is still the most
    // recent outbound. recordOutbound bumps last_outbound_at to each
    // send's timestamp, so a successful resend moves last_outbound_at
    // PAST the failed message — at which point the badge should clear.
    // A failure that is still the latest outbound has sent_at >=
    // last_outbound_at (they were stamped together at record time).
    const unresolved =
      !!latest &&
      String(latest.sent_at || "") >= String(conversation.last_outbound_at || "");
    return {
      ...conversation,
      has_failed_message: unresolved,
      latest_failed_message: unresolved ? latest : null,
    };
  });
}

