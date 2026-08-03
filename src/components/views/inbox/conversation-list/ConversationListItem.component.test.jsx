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

  it("renders one winning status plus an independent closing-window constraint", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));

    render(
      <ConversationListItem
        conv={baseConversation({
          has_pending_draft: true,
          unread_count: 3,
          last_inbound_at: "2026-06-11T12:30:00Z",
          last_outbound_at: null,
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Draft pending")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText(/Closes/)).toBeInTheDocument();
  });

  it("drops New and suggested-close row chips deliberately", () => {
    render(
      <ConversationListItem
        conv={baseConversation({
          lead_status: "records_created",
          closure_suggested_at: "2026-06-12T09:00:00Z",
          closure_suggested_reason: "stale_30d",
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/New$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggest closing/)).not.toBeInTheDocument();
  });

  it("preserves the exact decoded review reason on the Action needed badge", () => {
    const reviewTitle =
      "Needs review: AI flagged a handoff AND the draft is high-risk. Open to see the reason.";

    render(
      <ConversationListItem
        conv={baseConversation({
          needs_human_review: true,
          whatsapp_drafts: [
            {
              state: "pending",
              handoff_required: true,
              risk_level: "high",
            },
          ],
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Action needed")).toHaveAttribute("title", reviewTitle);
    expect(screen.getByText("Action needed")).toHaveAttribute("aria-label", reviewTitle);
  });

  it.each([
    ["Closed", { closed_at: "2026-06-12T10:00:00Z" }],
    ["Snoozed", { state: "snoozed" }],
    ["Taken over", { state: "human_takeover" }],
  ])("renders the %s lifecycle status", (label, overrides) => {
    render(
      <ConversationListItem
        conv={baseConversation(overrides)}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("exposes the absolute date on the relative timestamp", () => {
    const lastAt = "2026-06-12T09:00:00Z";
    const absolute = new Date(lastAt).toLocaleString("en-GB");

    render(
      <ConversationListItem
        conv={baseConversation({ last_message_at: lastAt })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    const timestamp = screen.getByText("12 Jun");
    expect(timestamp).toHaveAttribute("title", absolute);
    expect(timestamp).toHaveAttribute("aria-label", absolute);
  });

  it("keeps the compact row and checkbox target touch-safe", () => {
    render(
      <ConversationListItem
        conv={baseConversation()}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button").closest("div")).toHaveClass("min-h-16", "max-h-[72px]");
    expect(screen.getByRole("checkbox").parentElement).toHaveClass("min-h-11", "min-w-11");
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

  it("marks a closed conversation without striking through the name", () => {
    render(
      <ConversationListItem
        conv={baseConversation({ closed_at: "2026-06-12T10:00:00Z" })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // The name is muted, NOT struck through (strikethrough reads as deleted).
    const name = screen.getByText("Sarah Jones");
    expect(name.className).not.toContain("line-through");
    expect(name.className).toContain("text-brand-purple/55");
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

  it("previews the last message in either direction, first line only", () => {
    render(
      <ConversationListItem
        conv={baseConversation({
          last_message_text: "Sure, see you Tuesday\nat 9am",
          last_message_direction: "outbound",
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Sure, see you Tuesday")).toBeInTheDocument();
    expect(screen.queryByText(/at 9am/)).not.toBeInTheDocument();
  });

  it("aligns our messages left and the customer's right", () => {
    const { rerender } = render(
      <ConversationListItem
        conv={baseConversation({ last_message_text: "Our reply", last_message_direction: "outbound" })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Our reply").className).toContain("text-left");

    rerender(
      <ConversationListItem
        conv={baseConversation({ last_message_text: "Their message", last_message_direction: "inbound" })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Their message").className).toContain("text-right");
  });

  it("treats the fallback preview as the customer's even when we replied last (pre-migration)", () => {
    render(
      <ConversationListItem
        conv={baseConversation({
          last_outbound_at: "2026-06-12T10:00:00Z", // we replied after the 09:00 inbound
          // no last_message_text / last_message_direction yet (pre-migration)
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    // The only text available is last_customer_text (the customer's), so it
    // must align as theirs (right), not as ours.
    expect(screen.getByText("Can I book Bella in?").className).toContain("text-right");
  });

  it("never leaks template/flow codes in the preview", () => {
    render(
      <ConversationListItem
        conv={baseConversation({
          last_message_text: "[flow:123] Here's your booking link",
          last_message_direction: "outbound",
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Here's your booking link")).toBeInTheDocument();
    expect(screen.queryByText(/\[flow:/)).not.toBeInTheDocument();
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
