import { useRef } from "react";
import { useInboxWaitingTimes } from "../../../../supabase/hooks/useInboxWaitingTimes";
import { Plus, Search, X } from "lucide-react";
import { PageHeaderAction } from "../../../ui/index.js";
import { LoadingSpinner } from "../../../ui/LoadingSpinner.jsx";
import { InboxFilterChip } from "../InboxFilterChip.jsx";
import { ConversationListItem } from "../conversation-list/ConversationListItem.jsx";

const PRIMARY_FILTERS = [
  {
    key: "needs_attention",
    label: "Needs attention",
    color: "amber",
    hint: "Active conversations waiting on a reply, a review, a draft, a booking decision, an unread message, or a failed send.",
  },
  {
    key: "all",
    label: "All",
    color: "slate",
    clearable: false,
    hint: "Show every active conversation.",
  },
  {
    key: "done",
    label: "Done",
    color: "slate",
    hint: "Show conversations that have been marked complete. They reopen automatically if the customer messages again.",
  },
];

const SECONDARY_FILTERS = [
  {
    key: "drafts",
    label: "Drafts",
    color: "amber",
    hint: "Show only conversations with a pending AI draft waiting for staff approval.",
  },
  {
    key: "failed_sends",
    label: "Failed sends",
    color: "rose",
    hint: "Show conversations where the latest outbound send attempt failed.",
  },
  {
    key: "unread",
    label: "Unread",
    color: "purple",
    hint: "Show only conversations with unread customer messages.",
  },
  {
    key: "awaiting_reply",
    label: "Awaiting reply",
    color: "purple",
    hint: "Show active conversations where the latest customer message is newer than the latest staff reply.",
  },
];

const FILTER_LABELS = {
  needs_attention: "needs attention",
  all: "active conversations",
  awaiting_reply: "awaiting reply",
  failed_sends: "failed sends",
  unread: "unread",
  drafts: "pending drafts",
  done: "closed conversations",
};

export function ConversationPane({
  conversations,
  displayedConversations,
  loadingList,
  listError,
  refreshList,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  isSearching,
  trimmedQuery,
  listFilter,
  filterCounts,
  onFilterChange,
  conversationSummary,
  selectedId,
  selectedIds,
  onSelectConversation,
  onToggleSelect,
  onNewMessage,
  onShowFailed,
}) {
  const waitingTimes = useInboxWaitingTimes(conversations);
  const openButtonRefs = useRef([]);

  function handleOpenKeyDown(event, index) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    openButtonRefs.current[index + offset]?.focus();
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 px-2 py-2">
        <div data-testid="page-header" className="mb-2 flex items-center justify-between gap-2">
          <h1 className="font-display text-base font-extrabold text-brand-ink">Inbox</h1>
          {onNewMessage ? (
            <PageHeaderAction
              type="button"
              onClick={onNewMessage}
              title="Start a new WhatsApp thread with a customer. Meta requires an approved template for first contact."
              icon={Plus}
              className="!min-h-9 px-3"
            >
              New message
            </PageHeaderAction>
          ) : null}
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search all messages…"
            aria-label="Search all messages"
            className={`h-11 w-full rounded-control border border-slate-300 bg-white pl-9 text-sm font-semibold text-brand-ink shadow-sm outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-brand-ink focus:ring-2 focus:ring-brand-ink/20 ${
              searchQuery ? "pr-11" : "pr-3"
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-1"
            >
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-1.5" role="group" aria-label="Filter conversations">
          {[PRIMARY_FILTERS, SECONDARY_FILTERS].map((group, index) => (
            <div key={index === 0 ? "primary" : "secondary"} className="flex flex-wrap gap-1.5">
              {group.map((filter) => (
                <InboxFilterChip
                  key={filter.key}
                  label={filter.label}
                  count={filterCounts[filter.key] ?? 0}
                  active={listFilter === filter.key}
                  onClick={() => onFilterChange(filter.key)}
                  color={filter.color}
                  clearable={filter.clearable}
                  hint={filter.hint}
                />
              ))}
            </div>
          ))}
        </div>
        <span className="sr-only" role="status">{conversationSummary}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loadingList ? (
          <div className="p-4"><LoadingSpinner label="Loading messages…" /></div>
        ) : listError ? (
          <div role="alert" className="m-4 rounded-card border border-brand-mustard-tint bg-feedback-warning-tint p-4">
            <h2 className="text-sm font-bold text-feedback-warning-ink">We can&apos;t load your messages right now</h2>
            <p className="mt-1 text-xs text-feedback-warning-ink">
              The inbox is temporarily unavailable. This usually clears within a minute. If it keeps happening, the dashboard&apos;s WhatsApp widget may still show recent threads.
            </p>
            <button
              type="button"
              onClick={refreshList}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-feedback-warning-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-ink"
            >
              Try again
            </button>
            {import.meta.env.DEV && (
              <details className="mt-3 text-micro text-feedback-warning-ink">
                <summary>Dev: error details</summary>
                <pre className="mt-1 whitespace-pre-wrap">{String(listError?.message || listError)}</pre>
              </details>
            )}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-body text-slate-600">
            <p className="mb-1 font-semibold text-brand-ink">No WhatsApp conversations yet</p>
            <p className="text-xs text-slate-500">
              When a customer messages your WhatsApp number, their thread will appear here.
            </p>
          </div>
        ) : displayedConversations.length === 0 ? (
          <div className="p-6 text-center text-body text-slate-600">
            {isSearching ? (
              <>
                <p className="mb-1">
                  No messages match <span className="font-semibold">“{trimmedQuery}”</span>.
                </p>
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="font-semibold text-brand-ink underline hover:text-brand-purple-light"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="mb-1">
                  No conversations match <span className="font-semibold">{FILTER_LABELS[listFilter] ?? listFilter}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => onFilterChange("all")}
                  className="font-semibold text-brand-ink underline hover:text-brand-purple-light"
                >
                  Show all conversations
                </button>
              </>
            )}
          </div>
        ) : (
          <ul role="list" aria-label="Conversations" className="m-0 list-none p-0">
            {displayedConversations.map((conversation, index) => (
              <li key={conversation.id}>
                <ConversationListItem
                  conv={conversation}
                  waitingLabel={waitingTimes[conversation.id]}
                  isSelected={conversation.id === selectedId}
                  onSelect={onSelectConversation}
                  openButtonRef={(node) => { openButtonRefs.current[index] = node; }}
                  onOpenKeyDown={(event) => handleOpenKeyDown(event, index)}
                  isChecked={selectedIds.has(conversation.id)}
                  onToggleSelect={onToggleSelect}
                  onShowFailed={onShowFailed}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
