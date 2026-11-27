import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("moves focus among visible open buttons and activates them with Enter and Space", async () => {
    const user = userEvent.setup();
    const { onSelectConversation } = renderPane({
      displayedConversations: [conversations[0], conversations[2]],
      selectedId: "a",
    });
    const list = screen.getByRole("list", { name: "Conversations" });
    const [first, last] = within(list).getAllByRole("button");

    expect(first).toHaveAttribute("aria-current", "true");
    first.focus();
    await user.keyboard("{ArrowUp}");
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(last).toHaveFocus();
    expect(onSelectConversation).not.toHaveBeenCalled();
    await user.keyboard("{Enter}{ArrowUp} ");
    expect(first).toHaveFocus();
    expect(onSelectConversation.mock.calls).toEqual([["c"], ["a"]]);
  });

  it("tabs independently to checkboxes, open buttons and the failed-send action", async () => {
    const user = userEvent.setup();
    const failed = { ...conversations[1], has_failed_message: true };
    const onShowFailed = vi.fn();
    const { onSelectConversation, props } = renderPane({
      displayedConversations: [conversations[0], failed, conversations[2]],
      selectedIds: new Set(["a"]),
      onShowFailed,
    });
    const list = screen.getByRole("list", { name: "Conversations" });
    const [firstRow, failedRow, lastRow] = within(list).getAllByRole("listitem");
    const [openFailed, showFailed] = within(failedRow).getAllByRole("button");
    const failedCheckbox = within(failedRow).getByRole("checkbox");

    expect(within(firstRow).getByRole("checkbox")).toBeChecked();
    within(firstRow).getByRole("button").focus();
    await user.tab();
    expect(failedCheckbox).toHaveFocus();
    await user.keyboard("{ArrowDown} ");
    expect(failedCheckbox).toHaveFocus();
    expect(props.onToggleSelect.mock.calls).toEqual([["b"]]);
    await user.tab();
    expect(openFailed).toHaveFocus();
    await user.tab();
    expect(showFailed).toHaveFocus();
    await user.keyboard("{ArrowUp} ");
    expect(showFailed).toHaveFocus();
    expect(onShowFailed.mock.calls).toEqual([[failed]]);
    expect(onSelectConversation).not.toHaveBeenCalled();
    await user.tab();
    expect(within(lastRow).getByRole("checkbox")).toHaveFocus();
  });
});
