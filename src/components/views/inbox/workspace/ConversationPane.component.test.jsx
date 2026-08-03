import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationPane } from "./ConversationPane.jsx";

const conversations = [
  {
    id: "a",
    phone_e164: "+447700900111",
    humans: { name: "Amy", surname: "Adams" },
    last_customer_text: "First",
    last_inbound_at: "2026-08-03T08:00:00Z",
    unread_count: 0,
  },
  {
    id: "b",
    phone_e164: "+447700900222",
    humans: { name: "Bea", surname: "Brown" },
    last_customer_text: "Second",
    last_inbound_at: "2026-08-03T08:05:00Z",
    unread_count: 0,
  },
  {
    id: "c",
    phone_e164: "+447700900333",
    humans: { name: "Cara", surname: "Cole" },
    last_customer_text: "Third",
    last_inbound_at: "2026-08-03T08:10:00Z",
    unread_count: 0,
  },
];

function renderPane(overrides = {}) {
  const onSelectConversation = vi.fn();
  const props = {
    conversations,
    displayedConversations: conversations,
    loadingList: false,
    listError: null,
    refreshList: vi.fn(),
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    onClearSearch: vi.fn(),
    isSearching: false,
    trimmedQuery: "",
    listFilter: "all",
    filterCounts: {
      all: 3,
      awaiting_reply: 0,
      failed_sends: 0,
      unread: 0,
      drafts: 0,
      done: 0,
    },
    onFilterChange: vi.fn(),
    conversationSummary: "3 active conversations",
    selectedId: null,
    selectedIds: new Set(),
    onSelectConversation,
    onToggleSelect: vi.fn(),
    ...overrides,
  };

  return { ...render(<ConversationPane {...props} />), onSelectConversation, props };
}

describe("ConversationPane", () => {
  it("opens the third visible conversation after two ArrowDown presses", () => {
    const { onSelectConversation } = renderPane();
    const list = screen.getByRole("listbox", { name: "Conversations" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(onSelectConversation).toHaveBeenCalledWith("c");
  });

  it("moves only through the conversations left visible by filtering", () => {
    const visibleConversations = [conversations[0], conversations[2]];
    const { onSelectConversation } = renderPane({
      displayedConversations: visibleConversations,
    });
    const list = screen.getByRole("listbox", { name: "Conversations" });

    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });

    expect(onSelectConversation).toHaveBeenCalledWith("c");
    expect(onSelectConversation).not.toHaveBeenCalledWith("b");
  });
});
