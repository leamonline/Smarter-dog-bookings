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
});
