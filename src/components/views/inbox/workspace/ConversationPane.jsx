import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { LoadingSpinner } from "../../../ui/LoadingSpinner.jsx";
import { InboxFilterChip } from "../InboxFilterChip.jsx";
import { ConversationListItem } from "../conversation-list/ConversationListItem.jsx";

const FILTERS = [
  {
    key: "all",
    label: "All",
    color: "slate",
    clearable: false,
    hint: "Show every active conversation.",
  },
  {
    key: "awaiting_reply",
    label: "Awaiting reply",
    color: "purple",
    hint: "Show active conversations where the latest customer message is newer than the latest staff reply.",
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
    key: "drafts",
    label: "Drafts",
    color: "amber",
    hint: "Show only conversations with a pending AI draft waiting for staff approval.",
  },
  {
    key: "done",
    label: "Done",
    color: "slate",
    hint: "Show conversations that have been marked complete. They reopen automatically if the customer messages again.",
  },
];

const FILTER_LABELS = {
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
}) {
  const selectedIndex = displayedConversations.findIndex(
    (conversation) => conversation.id === selectedId,
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    selectedIndex >= 0 ? selectedIndex : 0,
  );
  const rowRefs = useRef([]);

  useEffect(() => {
    setActiveIndex((currentIndex) => {
      if (displayedConversations.length === 0) return 0;
      if (selectedIndex >= 0) return selectedIndex;
      return Math.min(currentIndex, displayedConversations.length - 1);
    });
  }, [displayedConversations.length, selectedIndex]);

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, displayedConversations]);

  function handleListKeyDown(event) {
    if (displayedConversations.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, displayedConversations.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onSelectConversation(displayedConversations[activeIndex].id);
    }
  }

  function handleSelect(index, conversationId) {
    setActiveIndex(index);
    onSelectConversation(conversationId);
  }

  const activeConversation = displayedConversations[activeIndex] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 px-2 py-2">
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
            className={`h-11 w-full rounded-control border border-slate-300 bg-white pl-9 text-sm font-semibold text-brand-purple shadow-sm outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 ${
              searchQuery ? "pr-11" : "pr-3"
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
            >
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </div>

        <div
          className="mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:thin]"
          role="group"
          aria-label="Filter conversations"
        >
          {FILTERS.map((filter) => (
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
        <span className="sr-only" role="status">{conversationSummary}</span>
      </div>

      <div
        role="listbox"
        aria-label="Conversations"
        aria-activedescendant={activeConversation ? `conversation-option-${activeConversation.id}` : undefined}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
      >
        {loadingList ? (
          <div className="p-4"><LoadingSpinner label="Loading messages…" /></div>
        ) : listError ? (
          <div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-900">We can&apos;t load your messages right now</h2>
            <p className="mt-1 text-xs text-amber-800">
              The inbox is temporarily unavailable. This usually clears within a minute. If it keeps happening, the dashboard&apos;s WhatsApp widget may still show recent threads.
            </p>
            <button
              type="button"
              onClick={refreshList}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-bold text-amber-50 hover:bg-amber-950"
            >
              Try again
            </button>
            {import.meta.env.DEV && (
              <details className="mt-3 text-micro text-amber-700">
                <summary>Dev: error details</summary>
                <pre className="mt-1 whitespace-pre-wrap">{String(listError?.message || listError)}</pre>
              </details>
            )}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-body text-slate-600">
            <p className="mb-1 font-semibold text-brand-purple">No WhatsApp conversations yet</p>
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
                  className="font-semibold text-brand-purple underline hover:text-brand-purple-light"
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
                  className="font-semibold text-brand-purple underline hover:text-brand-purple-light"
                >
                  Show all conversations
                </button>
              </>
            )}
          </div>
        ) : (
          displayedConversations.map((conversation, index) => (
            <div
              key={conversation.id}
              id={`conversation-option-${conversation.id}`}
              ref={(node) => { rowRefs.current[index] = node; }}
              role="option"
              aria-selected={conversation.id === selectedId}
            >
              <ConversationListItem
                conv={conversation}
                isSelected={conversation.id === selectedId}
                onSelect={(conversationId) => handleSelect(index, conversationId)}
                isChecked={selectedIds.has(conversation.id)}
                onToggleSelect={onToggleSelect}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
