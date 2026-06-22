import { render, screen } from "@testing-library/react";
import { describe, expect, it, afterEach, vi } from "vitest";
import { ConversationListItem } from "./ConversationListItem.jsx";

function baseConversation(overrides = {}) {
  return {
    id: "conv-1",
    phone_e164: "+447700900111",
    humans: { name: "Sarah", surname: "Jones" },
    last_customer_text: "Can I book Bella in?",
    last_inbound_at: "2026-06-12T09:00:00Z",
    last_outbound_at: "2026-06-12T08:00:00Z",
    unread_count: 0,
    channel: "whatsapp",
    ...overrides,
  };
}

describe("ConversationListItem", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an amber window chip when an awaiting-reply WhatsApp thread is closing soon", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));

    render(
      <ConversationListItem
        conv={baseConversation({
          last_inbound_at: "2026-06-11T13:00:00Z",
          last_outbound_at: "2026-06-11T12:00:00Z",
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Closes in 3h 0m")).toBeInTheDocument();
  });

  it("shows a template-needed chip once an awaiting-reply WhatsApp window is closed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T14:00:00Z"));

    render(
      <ConversationListItem
        conv={baseConversation({
          last_inbound_at: "2026-06-11T13:00:00Z",
          last_outbound_at: "2026-06-11T12:00:00Z",
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Template needed")).toBeInTheDocument();
  });

  it("shows a failed-send chip with the latest delivery reason", () => {
    render(
      <ConversationListItem
        conv={baseConversation({
          has_failed_message: true,
          latest_failed_message: { error_message: "Meta rejected it" },
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed send")).toBeInTheDocument();
    expect(screen.getByText("Failed send")).toHaveAttribute(
      "title",
      "Latest failed send: Meta rejected it",
    );
  });

  it("tints unread rows yellow and leaves read rows white", () => {
    const { rerender } = render(
      <ConversationListItem
        conv={baseConversation({ unread_count: 3 })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button").className).toContain("brand-yellow");

    rerender(
      <ConversationListItem
        conv={baseConversation({ unread_count: 0 })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    const readRow = screen.getByRole("button");
    expect(readRow.className).toContain("bg-white");
    expect(readRow.className).not.toContain("brand-yellow");
  });

  it("never shows a 'Handled by staff' badge for human-takeover threads", () => {
    render(
      <ConversationListItem
        conv={baseConversation({ state: "human_takeover" })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/handled by staff/i)).not.toBeInTheDocument();
  });

  it("never renders a '(no text)' placeholder when there is no preview text", () => {
    render(
      <ConversationListItem
        conv={baseConversation({ last_customer_text: null })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("(no text)")).not.toBeInTheDocument();
    // The name still renders so the row stays usable.
    expect(screen.getByText("Sarah Jones")).toBeInTheDocument();
  });
});
