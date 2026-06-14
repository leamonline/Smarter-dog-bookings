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
    updateConversationNotes: vi.fn(),
    snoozeConversation: vi.fn(),
    unsnoozeConversation: vi.fn(),
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
    vi.useRealTimers();
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

  it("shows all active conversations as an explicit chip", () => {
    renderInbox(
      baseState({
        conversations: [
          { id: "conv-1", phone_e164: "+447700900111", unread_count: 0 },
          { id: "conv-2", phone_e164: "+447700900222", unread_count: 0 },
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "All: 2. Filter is on." }),
    ).toBeInTheDocument();
  });

  it("zero-count inactive filter chips stay enabled so staff can always change filters", () => {
    renderInbox();
    const drafts = screen.getByRole("button", {
      name: "Drafts: 0. No conversations match.",
    });
    expect(drafts).toBeEnabled();
    fireEvent.click(drafts);
    // Empty-state copy stays put because no conversations match
    // either filter; the chip click should not crash.
    expect(
      screen.getByText("No WhatsApp conversations yet"),
    ).toBeInTheDocument();
  });

  it("counts unread conversations rather than total unread messages", () => {
    renderInbox(
      baseState({
        conversations: [
          { id: "conv-1", phone_e164: "+447700900111", unread_count: 4 },
          { id: "conv-2", phone_e164: "+447700900222", unread_count: 0 },
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "Unread: 1. Click to filter." }),
    ).toBeInTheDocument();
  });

  it("filters conversations awaiting a staff reply", () => {
    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-awaiting",
            phone_e164: "+447700900111",
            humans: { name: "Sarah", surname: "Jones" },
            last_customer_text: "Can I book Bella in?",
            last_inbound_at: "2026-06-12T09:00:00Z",
            last_outbound_at: "2026-06-12T08:00:00Z",
            unread_count: 0,
          },
          {
            id: "conv-replied",
            phone_e164: "+447700900222",
            humans: { name: "Mina", surname: "Patel" },
            last_customer_text: "Thanks",
            last_inbound_at: "2026-06-12T07:00:00Z",
            last_outbound_at: "2026-06-12T08:00:00Z",
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Awaiting reply: 1. Click to filter." }),
    );

    expect(screen.getByText("Sarah Jones")).toBeInTheDocument();
    expect(screen.queryByText("Mina Patel")).not.toBeInTheDocument();
  });

  it("filters the closing-soon queue by soonest WhatsApp window first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));

    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-soon",
            phone_e164: "+447700900111",
            humans: { name: "Soon", surname: "Owner" },
            last_customer_text: "Still waiting",
            last_inbound_at: "2026-06-11T13:00:00Z",
            last_outbound_at: "2026-06-11T12:00:00Z",
            unread_count: 0,
          },
          {
            id: "conv-later",
            phone_e164: "+447700900222",
            humans: { name: "Later", surname: "Owner" },
            last_customer_text: "Can you help?",
            last_inbound_at: "2026-06-12T09:00:00Z",
            last_outbound_at: null,
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Closing soon: 1. Click to filter." }),
    );

    expect(screen.getByText("Soon Owner")).toBeInTheDocument();
    expect(screen.queryByText("Later Owner")).not.toBeInTheDocument();
  });

  it("filters conversations with failed sends", () => {
    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-failed",
            phone_e164: "+447700900111",
            humans: { name: "Failed", surname: "Send" },
            last_customer_text: "Hello?",
            has_failed_message: true,
            latest_failed_message: { error_message: "Meta rejected it" },
            unread_count: 0,
          },
          {
            id: "conv-ok",
            phone_e164: "+447700900222",
            humans: { name: "Okay", surname: "Send" },
            last_customer_text: "All good",
            has_failed_message: false,
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Failed sends: 1. Click to filter." }),
    );

    expect(screen.getByText("Failed Send")).toBeInTheDocument();
    expect(screen.queryByText("Okay Send")).not.toBeInTheDocument();
  });

  it("keeps snoozed conversations out of the active queue until staff opens the Snoozed filter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));

    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-active",
            phone_e164: "+447700900111",
            state: "ai_handling",
            humans: { name: "Ready", surname: "Owner" },
            last_customer_text: "Can you help?",
            unread_count: 0,
          },
          {
            id: "conv-snoozed",
            phone_e164: "+447700900222",
            state: "snoozed",
            snoozed_until: "2026-06-12T15:00:00Z",
            humans: { name: "Later", surname: "Owner" },
            last_customer_text: "Nudge me later",
            unread_count: 0,
          },
          {
            id: "conv-due",
            phone_e164: "+447700900333",
            state: "snoozed",
            snoozed_until: "2026-06-12T09:00:00Z",
            humans: { name: "Due", surname: "Owner" },
            last_customer_text: "This follow-up is due",
            unread_count: 0,
          },
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "All: 2. Filter is on." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Snoozed: 1. Click to filter." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ready Owner")).toBeInTheDocument();
    expect(screen.getByText("Due Owner")).toBeInTheDocument();
    expect(screen.queryByText("Later Owner")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Snoozed: 1. Click to filter." }),
    );

    expect(screen.queryByText("Ready Owner")).not.toBeInTheDocument();
    expect(screen.queryByText("Due Owner")).not.toBeInTheDocument();
    expect(screen.getByText("Later Owner")).toBeInTheDocument();
  });

  it("snoozes the selected conversation from the header preset menu", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));
    const snoozeConversation = vi.fn().mockResolvedValue({ ok: true });

    renderInbox(
      baseState({
        selectedId: "conv-1",
        selectedConversation: {
          id: "conv-1",
          phone_e164: "+447700900123",
          state: "ai_handling",
          last_inbound_at: "2026-06-12T09:00:00Z",
        },
        snoozeConversation,
      }),
    );

    fireEvent.change(screen.getByLabelText("Snooze conversation"), {
      target: { value: "one_hour" },
    });

    expect(snoozeConversation).toHaveBeenCalledWith("2026-06-12T11:00:00.000Z");
  });

  it("lets staff unsnooze a selected snoozed conversation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));
    const unsnoozeConversation = vi.fn().mockResolvedValue({ ok: true });

    renderInbox(
      baseState({
        selectedId: "conv-1",
        selectedConversation: {
          id: "conv-1",
          phone_e164: "+447700900123",
          state: "snoozed",
          snoozed_until: "2026-06-12T15:00:00Z",
        },
        unsnoozeConversation,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Unsnooze" }));

    expect(unsnoozeConversation).toHaveBeenCalled();
  });

  it("keeps close suggestions out of the urgent Needs review count", () => {
    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-review",
            phone_e164: "+447700900111",
            humans: { name: "Urgent", surname: "Review" },
            last_customer_text: "Can you check this?",
            needs_human_review: true,
            unread_count: 0,
          },
          {
            id: "conv-close",
            phone_e164: "+447700900222",
            humans: { name: "Tidy", surname: "Close" },
            last_customer_text: "Thanks!",
            closure_suggested_at: "2026-06-12T09:00:00Z",
            closure_suggested_reason: "booking_confirmed_quiet",
            unread_count: 0,
          },
        ],
      }),
    );

    expect(
      screen.getByRole("button", { name: "Needs review: 1. Click to filter." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Suggested close: 1. Click to filter." }),
    ).toBeInTheDocument();
  });

  it("filters urgent reviews separately from suggested closes", () => {
    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-review",
            phone_e164: "+447700900111",
            humans: { name: "Urgent", surname: "Review" },
            last_customer_text: "Can you check this?",
            needs_human_review: true,
            unread_count: 0,
          },
          {
            id: "conv-close",
            phone_e164: "+447700900222",
            humans: { name: "Tidy", surname: "Close" },
            last_customer_text: "Thanks!",
            closure_suggested_at: "2026-06-12T09:00:00Z",
            closure_suggested_reason: "booking_confirmed_quiet",
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Needs review: 1. Click to filter." }),
    );
    expect(screen.getByText("Urgent Review")).toBeInTheDocument();
    expect(screen.queryByText("Tidy Close")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Suggested close: 1. Click to filter." }),
    );
    expect(screen.queryByText("Urgent Review")).not.toBeInTheDocument();
    expect(screen.getByText("Tidy Close")).toBeInTheDocument();
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
