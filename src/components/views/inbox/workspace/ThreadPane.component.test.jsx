import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadPane } from "./ThreadPane.jsx";

function message(id, content, sentAt) {
  return {
    id,
    direction: "inbound",
    content,
    sent_at: sentAt,
    status: "received",
    channel: "whatsapp",
  };
}

function defaultProps(overrides = {}) {
  return {
    selectedId: "conv-1",
    hasConversations: true,
    conversation: {
      id: "conv-1",
      human_id: "human-1",
      phone_e164: "+447700900123",
      last_inbound_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      humans: { name: "Sarah", surname: "Jones" },
    },
    customerEmail: "sarah@example.com",
    messages: [],
    draft: null,
    bookingActions: [],
    attachedActions: [],
    dogNamesById: {},
    dogNames: [],
    loadingDetail: false,
    detailError: null,
    actionInFlight: false,
    draftValue: "",
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onRetryMessage: vi.fn(),
    onSendTemplate: vi.fn(),
    onGenerateReply: vi.fn(),
    onRetryLoad: vi.fn(),
    onBack: vi.fn(),
    onResolve: vi.fn(),
    onReopen: vi.fn(),
    onOpenBooking: vi.fn(),
    onOpenCustomer: vi.fn(),
    onApproveDraft: vi.fn(),
    onRejectDraft: vi.fn(),
    onApplyBookingAction: vi.fn(),
    onRejectBookingAction: vi.fn(),
    ...overrides,
  };
}

describe("ThreadPane", () => {
  it("renders the complete loaded message history in chronological order", () => {
    render(
      <ThreadPane
        {...defaultProps({
          messages: [
            message("m-2", "Newest message", "2026-08-02T09:05:00Z"),
            message("m-1", "Oldest message", "2026-08-02T09:00:00Z"),
          ],
        })}
      />,
    );

    const log = screen.getByRole("log", { name: "Conversation messages" });
    expect(log.textContent.indexOf("Oldest message")).toBeLessThan(
      log.textContent.indexOf("Newest message"),
    );
  });

  it("only follows new messages when the reader was within 80px of the bottom", async () => {
    const props = defaultProps({
      messages: [message("m-1", "First message", "2026-08-02T09:00:00Z")],
    });
    const { rerender } = render(<ThreadPane {...props} />);
    const log = screen.getByRole("log", { name: "Conversation messages" });
    let scrollTop = 420;
    let scrollHeight = 500;

    Object.defineProperties(log, {
      clientHeight: { configurable: true, get: () => 100 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value) => {
          scrollTop = value;
        },
      },
    });

    fireEvent.scroll(log);
    scrollHeight = 600;
    rerender(
      <ThreadPane
        {...props}
        messages={[
          ...props.messages,
          message("m-2", "Second message", "2026-08-02T09:01:00Z"),
        ]}
      />,
    );
    await waitFor(() => expect(scrollTop).toBe(600));

    scrollTop = 200;
    fireEvent.scroll(log);
    scrollHeight = 700;
    rerender(
      <ThreadPane
        {...props}
        messages={[
          ...props.messages,
          message("m-2", "Second message", "2026-08-02T09:01:00Z"),
          message("m-3", "Third message", "2026-08-02T09:02:00Z"),
        ]}
      />,
    );
    await waitFor(() => expect(scrollTop).toBe(200));
  });
});
