// Smoke-level tests for InboxView. The view destructures ~28 values
// from useWhatsAppInbox and switches between 6 list modes; locking
// these entry-point states now means the planned mode-extraction
// (register item #10) can be validated as a no-op rather than a
// rewrite.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

function setInboxState(value) {
  globalThis.__useWhatsAppInboxMock = value;
}

vi.mock("../../../supabase/hooks/useWhatsAppInbox.js", () => ({
  useWhatsAppInbox: () => globalThis.__useWhatsAppInboxMock,
}));

vi.mock("./hooks/useCustomerContext.js", () => ({
  useCustomerContext: () => ({
    customer: null,
    loading: false,
    error: null,
  }),
}));

const { InboxView } = await import("./InboxView.jsx");

function baseState(overrides = {}) {
  return {
    conversations: [],
    loadingList: false,
    listError: null,
    selectedId: null,
    selectedConversation: null,
    messages: [],
    draft: null,
    bookingActions: [],
    attachedActions: [],
    loadingDetail: false,
    detailError: null,
    selectConversation: vi.fn(),
    approveDraft: vi.fn(),
    approveDraftAndApply: vi.fn(),
    rejectDraft: vi.fn(),
    sendManualReply: vi.fn(),
    applyBookingAction: vi.fn(),
    rejectBookingAction: vi.fn(),
    setAIMode: vi.fn(),
    resolveConversation: vi.fn(),
    reopenConversation: vi.fn(),
    sendTemplate: vi.fn(),
    sendOutboundTemplate: vi.fn(),
    sendOutboundSMS: vi.fn(),
    generateReplyForConversation: vi.fn(),
    dogNames: [],
    dogNamesById: {},
    actionInFlight: false,
    refreshList: vi.fn(),
    ...overrides,
  };
}

function renderInbox(state = baseState()) {
  setInboxState(state);
  return render(
    <MemoryRouter>
      <ToastProvider>
        <InboxView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("InboxView", () => {
  beforeEach(() => {
    setInboxState(baseState());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Inbox header on first paint", () => {
    renderInbox();
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("shows the empty-state copy when there are zero conversations", () => {
    renderInbox(baseState({ conversations: [] }));
    expect(
      screen.getByText("No WhatsApp conversations yet"),
    ).toBeInTheDocument();
  });

  it("renders the error banner when listError is set", () => {
    renderInbox(
      baseState({ listError: new Error("network down") }),
    );
    expect(
      screen.getByText("We can't load your messages right now"),
    ).toBeInTheDocument();
  });

  it("renders the Unread / Drafts / Bookings filter chip row", () => {
    renderInbox();
    const filterRow = screen.getByLabelText("Filter conversations");
    expect(filterRow).toBeInTheDocument();
    // Spot-check one chip rather than all six so the test doesn't
    // churn if copy changes.
    expect(
      screen.getByRole("button", { name: /^Unread\b/ }),
    ).toBeInTheDocument();
  });

  it("clicking a filter chip is safe when there are no conversations", () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /^Drafts\b/ }));
    // Empty-state copy stays put because no conversations match
    // either filter; the chip click should not crash.
    expect(
      screen.getByText("No WhatsApp conversations yet"),
    ).toBeInTheDocument();
  });

  it("scrolls the thread to the latest item after messages render", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    renderInbox(
      baseState({
        selectedId: "conv-1",
        selectedConversation: {
          id: "conv-1",
          phone_e164: "+447700900123",
          last_inbound_at: "2026-06-12T09:00:00Z",
        },
        messages: [
          {
            id: "m-1",
            direction: "inbound",
            content: "Older message",
            sent_at: "2026-06-12T09:00:00Z",
            status: "received",
            channel: "whatsapp",
          },
          {
            id: "m-2",
            direction: "inbound",
            content: "Newest message",
            sent_at: "2026-06-12T09:05:00Z",
            status: "received",
            channel: "whatsapp",
          },
        ],
      }),
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
