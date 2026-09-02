/**
 * useInboxListState — the conversation list's mode, search and bulk
 * selection (Debt 10). Extracted from InboxWorkspaceController.jsx.
 *
 * The list mode lives in the URL as `?filter=<mode>` (absent = "all"), so a
 * filtered inbox is a shareable, back-button-friendly address and the
 * controller no longer owns a cascade of mode state. Search and the bulk
 * selection stay local: a search is a transient query, and a selection must
 * never outlive the rows the staff member can see.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInboxMessageSearch } from "../hooks/useInboxMessageSearch.js";
import {
  countInboxFilters,
  filterInboxConversations,
  parseInboxListFilter,
  searchInboxConversations,
  splitByClosed,
  summariseInboxList,
  type InboxListConversation,
  type InboxListFilter,
} from "./inboxListModel";

export const INBOX_FILTER_PARAM = "filter";

export interface UseInboxListStateOptions<T extends InboxListConversation> {
  conversations: T[];
}

export function useInboxListState<T extends InboxListConversation>({
  conversations,
}: UseInboxListStateOptions<T>) {
  // ── Mode: one of the six chips, read from the URL ──────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const listFilter = parseInboxListFilter(searchParams.get(INBOX_FILTER_PARAM));

  const setListFilter = useCallback(
    (next: InboxListFilter) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === "all") params.delete(INBOX_FILTER_PARAM);
          else params.set(INBOX_FILTER_PARAM, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Clicking the active chip clears the filter (back to "all"); "done" is
  // its own filter and toggles the same way.
  const toggleFilter = useCallback(
    (next: InboxListFilter) => setListFilter(listFilter === next ? "all" : next),
    [listFilter, setListFilter],
  );

  // ── Search: free text across the FULL message history ──────────
  // A non-empty query overrides the active filter and searches the whole
  // inbox (see searchResults below).
  const [searchQuery, setSearchQuery] = useState("");
  const clearSearch = useCallback(() => setSearchQuery(""), []);
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const { messageMatchIds, searching: searchingMessages } = useInboxMessageSearch(searchQuery) as {
    messageMatchIds: Set<string>;
    searching: boolean;
  };

  // ── Derived lists ──────────────────────────────────────────────
  const { active: activeConversations, closed: closedConversations } = useMemo(
    () => splitByClosed(conversations),
    [conversations],
  );
  const filterCounts = useMemo(
    () => countInboxFilters(activeConversations, closedConversations),
    [activeConversations, closedConversations],
  );
  const filteredConversations = useMemo(
    () => filterInboxConversations(listFilter, activeConversations, closedConversations),
    [listFilter, activeConversations, closedConversations],
  );
  const searchResults = useMemo(
    () => searchInboxConversations(conversations, trimmedQuery, messageMatchIds),
    [conversations, trimmedQuery, messageMatchIds],
  );
  const displayedConversations = isSearching ? searchResults : filteredConversations;

  const conversationSummary = summariseInboxList({
    isSearching,
    searchingMessages,
    trimmedQuery,
    displayedCount: displayedConversations.length,
    listFilter,
    activeCount: activeConversations.length,
    closedCount: closedConversations.length,
    filteredCount: filteredConversations.length,
  });

  // ── Multi-select for bulk close ────────────────────────────────
  // A Set of conversation ids ticked via the per-row checkboxes; >0 reveals
  // the floating action bar. Cleared whenever the filter or search mode
  // changes, so a hidden row can never be closed by a selection the staff
  // member can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelectedIds(new Set());
  }, [listFilter, isSearching]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    listFilter,
    setListFilter,
    toggleFilter,
    searchQuery,
    setSearchQuery,
    clearSearch,
    trimmedQuery,
    isSearching,
    searchingMessages,
    activeConversations,
    closedConversations,
    filteredConversations,
    displayedConversations,
    filterCounts,
    conversationSummary,
    selectedIds,
    toggleSelect,
    clearSelection,
  };
}

export type InboxListState = ReturnType<typeof useInboxListState>;
