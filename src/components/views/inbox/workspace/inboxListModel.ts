/**
 * inboxListModel — the pure half of the inbox conversation list (Debt 10).
 *
 * The six list modes, their counts, the filtered / searched lists and the
 * summary line were inline in InboxWorkspaceController.jsx; they are pure
 * functions of the conversation rows, so they live here with unit tests and
 * the controller composes them through useInboxListState.
 */
import { displayName, isAwaitingReply } from "../helpers.js";

export const INBOX_LIST_FILTERS = [
  "needs_attention",
  "all",
  "awaiting_reply",
  "failed_sends",
  "unread",
  "drafts",
  "done",
] as const;

export type InboxListFilter = (typeof INBOX_LIST_FILTERS)[number];

/** Chip labels used by the summary line ("Filtered: unread · 3 of 12"). */
export const INBOX_FILTER_LABELS: Record<InboxListFilter, string> = {
  needs_attention: "needs attention",
  all: "active conversations",
  awaiting_reply: "awaiting reply",
  failed_sends: "failed sends",
  unread: "unread",
  drafts: "pending drafts",
  done: "closed conversations",
};

/** The list-row fields the modes read (a structural subset of the
 *  useWhatsAppInbox conversation row). */
export interface InboxListConversation {
  id: string;
  closed_at?: string | null;
  unread_count?: number | null;
  has_failed_message?: boolean | null;
  has_pending_draft?: boolean | null;
  has_pending_booking_action?: boolean | null;
  needs_human_review?: boolean | null;
  phone_e164?: string | null;
  last_customer_text?: string | null;
  notes?: string | null;
}

/** The URL carries the mode as `?filter=`; anything unknown is "all". */
export function parseInboxListFilter(value: string | null | undefined): InboxListFilter {
  return (INBOX_LIST_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as InboxListFilter)
    : "all";
}

/** Split the active (open) and closed piles once so each counter doesn't
 *  re-walk the list. */
export function splitByClosed<T extends InboxListConversation>(
  conversations: T[],
): { active: T[]; closed: T[] } {
  const active: T[] = [];
  const closed: T[] = [];
  for (const c of conversations) (c.closed_at ? closed : active).push(c);
  return { active, closed };
}

/**
 * Needs attention is the union of the states staff can act on. It does not
 * invent a stored status: a conversation counts when it is waiting on a
 * reply, still unread, holding a draft or booking proposal, flagged for
 * review, or carrying a failed send. Closed conversations are Done.
 */
export function conversationNeedsAttention(conversation: InboxListConversation): boolean {
  if (conversation.closed_at) return false;
  return Boolean(
    isAwaitingReply(conversation)
    || (conversation.unread_count || 0) > 0
    || conversation.has_failed_message
    || conversation.has_pending_draft
    || conversation.has_pending_booking_action
    || conversation.needs_human_review,
  );
}

/** Counts are computed over ACTIVE only (except Done, which is the closed-pile
 *  count). A closed conversation shouldn't bump the Unread or Needs attention
 *  chips — closing it is what dropped it off the queue. */
export function countInboxFilters<T extends InboxListConversation>(
  active: T[],
  closed: T[],
): Record<InboxListFilter, number> {
  return {
    needs_attention: active.filter((c) => conversationNeedsAttention(c)).length,
    all: active.length,
    awaiting_reply: active.filter((c) => isAwaitingReply(c)).length,
    failed_sends: active.filter((c) => !!c.has_failed_message).length,
    unread: active.filter((c) => (c.unread_count || 0) > 0).length,
    drafts: active.filter((c) => !!c.has_pending_draft).length,
    done: closed.length,
  };
}

/** "all" shows every ACTIVE conversation (closed ones only appear under
 *  "done"); the other active modes pre-filter to a subset for focused sweeps. */
export function filterInboxConversations<T extends InboxListConversation>(
  filter: InboxListFilter,
  active: T[],
  closed: T[],
): T[] {
  switch (filter) {
    case "needs_attention":
      return active.filter((c) => conversationNeedsAttention(c));
    case "awaiting_reply":
      return active.filter((c) => isAwaitingReply(c));
    case "failed_sends":
      return active.filter((c) => !!c.has_failed_message);
    case "unread":
      return active.filter((c) => (c.unread_count || 0) > 0);
    case "drafts":
      return active.filter((c) => !!c.has_pending_draft);
    case "done":
      return closed;
    case "all":
    default:
      return active;
  }
}

/** Search matches the whole inbox (active + closed) on the customer name,
 *  phone, last-message preview and conversation note (instant, client-side),
 *  OR on full message content via `messageMatchIds` from the debounced server
 *  query. Order follows the list's existing recency sort. */
export function searchInboxConversations<T extends InboxListConversation>(
  conversations: T[],
  trimmedQuery: string,
  messageMatchIds: Set<string>,
): T[] {
  if (!trimmedQuery) return [];
  const q = trimmedQuery.toLowerCase();
  return conversations.filter((c) => {
    if (messageMatchIds.has(c.id)) return true;
    const name = displayName(c).toLowerCase();
    const phone = (c.phone_e164 || "").toLowerCase();
    const preview = (c.last_customer_text || "").toLowerCase();
    const note = (c.notes || "").toLowerCase();
    return (
      name.includes(q) ||
      phone.includes(q) ||
      preview.includes(q) ||
      note.includes(q)
    );
  });
}

export interface InboxListSummaryInput {
  isSearching: boolean;
  searchingMessages: boolean;
  trimmedQuery: string;
  displayedCount: number;
  listFilter: InboxListFilter;
  activeCount: number;
  closedCount: number;
  filteredCount: number;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The one-line status under the search box. */
export function summariseInboxList({
  isSearching,
  searchingMessages,
  trimmedQuery,
  displayedCount,
  listFilter,
  activeCount,
  closedCount,
  filteredCount,
}: InboxListSummaryInput): string {
  if (isSearching) {
    return searchingMessages
      ? `Searching all messages for “${trimmedQuery}”…`
      : `${plural(displayedCount, "result")} for “${trimmedQuery}”`;
  }
  if (listFilter === "all") return plural(activeCount, "active conversation");
  if (listFilter === "done") return plural(closedCount, "closed conversation");
  return `Filtered: ${INBOX_FILTER_LABELS[listFilter]} · ${filteredCount} of ${activeCount}`;
}
