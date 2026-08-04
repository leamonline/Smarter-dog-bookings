// Smoke-level tests for InboxView. The view destructures ~28 values
// from useWhatsAppInbox and switches between 6 list modes; locking
// these entry-point states now means the planned mode-extraction
// (register item #10) can be validated as a no-op rather than a
// rewrite.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

function setInboxState(value) {
  globalThis.__useWhatsAppInboxMock = value;
}

function setMessageSearch(value) {
  globalThis.__useInboxMessageSearchMock = value;
}

// The diary defaults to today, so pin the day settings to whatever "today"
// resolves to in this run rather than a fixed calendar date.
function todayStr() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

vi.mock("../../../supabase/hooks/useWhatsAppInbox.js", () => ({
  useWhatsAppInbox: () => globalThis.__useWhatsAppInboxMock,
}));

vi.mock("../../../contexts/SalonContext", () => ({
  useSalon: () => ({
    daySettings: { [todayStr()]: { isOpen: true, extraSlots: [], overrides: {} } },
    bookingsByDate: {},
  }),
}));

vi.mock("../../../supabase/hooks/useSalonConfig.js", () => ({
  useSalonConfig: () => ({ config: { dailyDogCap: 14 }, loading: false, error: null }),
}));

vi.mock("./hooks/useCustomerContext.js", () => ({
  useCustomerContext: () => ({
    customer: null,
    loading: false,
    error: null,
  }),
}));

vi.mock("./hooks/useInboxMessageSearch.js", () => ({
  useInboxMessageSearch: () =>
    globalThis.__useInboxMessageSearchMock ?? {
      messageMatchIds: new Set(),
      searching: false,
    },
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
    rejectDraft: vi.fn(),
    sendManualReply: vi.fn(),
    applyBookingAction: vi.fn(),
    rejectBookingAction: vi.fn(),
    setAIMode: vi.fn(),
    resolveConversation: vi.fn(),
    reopenConversation: vi.fn(),
    bulkResolveConversations: vi.fn((ids) => Promise.resolve({ ok: true, ids })),
    bulkReopenConversations: vi.fn(() => Promise.resolve({ ok: true })),
    updateConversationNotes: vi.fn(),
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
    setMessageSearch({ messageMatchIds: new Set(), searching: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the Inbox header on first paint", () => {
    renderInbox();
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("composes the Inbox through the three workspace regions", () => {
    renderInbox();

    expect(screen.getByRole("region", { name: "Conversations" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Message thread" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Booking and customer context" }),
    ).toBeInTheDocument();
  });

  it("renders the compact conversation listbox through the route entry", () => {
    renderInbox();

    expect(
      screen.getByRole("listbox", { name: "Conversations" }),
    ).toBeInTheDocument();
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

  it("renders the filter chip row", () => {
    renderInbox();
    const filterRow = screen.getByLabelText("Filter conversations");
    expect(filterRow).toBeInTheDocument();
    // Spot-check one chip rather than all of them so the test doesn't
    // churn if copy changes.
    expect(
      screen.getByRole("button", { name: /^Unread\b/ }),
    ).toBeInTheDocument();
  });

  it("no longer offers a Snoozed filter chip", () => {
    renderInbox();
    expect(
      screen.queryByRole("button", { name: /^Snoozed\b/ }),
    ).not.toBeInTheDocument();
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

  it("no longer offers the Closing soon / Bookings / Needs review / Suggested close chips", () => {
    renderInbox();
    for (const label of ["Closing soon", "Bookings", "Needs review", "Suggested close"]) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`^${label}\\b`) }),
      ).not.toBeInTheDocument();
    }
    // The chips that remain are still present.
    expect(screen.getByRole("button", { name: /^All\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Awaiting reply\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Failed sends\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Unread\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Drafts\b/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Done\b/ })).toBeInTheDocument();
  });

  it("filters the list by customer name as you type in the search box", () => {
    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-1",
            phone_e164: "+447700900111",
            humans: { name: "Sarah", surname: "Jones" },
            last_customer_text: "Can I book Bella in?",
            unread_count: 0,
          },
          {
            id: "conv-2",
            phone_e164: "+447700900222",
            humans: { name: "Mina", surname: "Patel" },
            last_customer_text: "Thanks",
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.change(screen.getByLabelText("Search all messages"), {
      target: { value: "sarah" },
    });

    expect(screen.getByText("Sarah Jones")).toBeInTheDocument();
    expect(screen.queryByText("Mina Patel")).not.toBeInTheDocument();
  });

  it("surfaces conversations whose message history matches, even when the preview doesn't", () => {
    // The server-side message search returns conv-2's id; its name and
    // last-message preview don't contain the query, so this proves the
    // search reaches the full message history, not just the preview.
    setMessageSearch({ messageMatchIds: new Set(["conv-2"]), searching: false });

    renderInbox(
      baseState({
        conversations: [
          {
            id: "conv-1",
            phone_e164: "+447700900111",
            humans: { name: "Sarah", surname: "Jones" },
            last_customer_text: "Can I book Bella in?",
            unread_count: 0,
          },
          {
            id: "conv-2",
            phone_e164: "+447700900222",
            humans: { name: "Mina", surname: "Patel" },
            last_customer_text: "Thanks",
            unread_count: 0,
          },
        ],
      }),
    );

    fireEvent.change(screen.getByLabelText("Search all messages"), {
      target: { value: "matting" },
    });

    expect(screen.getByText("Mina Patel")).toBeInTheDocument();
    expect(screen.queryByText("Sarah Jones")).not.toBeInTheDocument();
  });

  it("bulk-closes the ticked conversations in a single call and reveals the action bar", async () => {
    const bulkResolveConversations = vi.fn((ids) =>
      Promise.resolve({ ok: true, ids }),
    );
    renderInbox(
      baseState({
        bulkResolveConversations,
        conversations: [
          { id: "conv-1", phone_e164: "+447700900111", humans: { name: "Sarah", surname: "Jones" }, unread_count: 0 },
          { id: "conv-2", phone_e164: "+447700900222", humans: { name: "Mina", surname: "Patel" }, unread_count: 0 },
        ],
      }),
    );

    // No action bar until something is ticked.
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();

    fireEvent.click(screen.getByLabelText("Select conversation with Sarah Jones"));
    fireEvent.click(screen.getByLabelText("Select conversation with Mina Patel"));

    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(bar).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close 2 conversations" }),
    );

    await waitFor(() =>
      expect(bulkResolveConversations).toHaveBeenCalledWith(["conv-1", "conv-2"]),
    );
  });

  it("clears the selection when the filter changes so hidden rows can't be closed", () => {
    renderInbox(
      baseState({
        conversations: [
          { id: "conv-1", phone_e164: "+447700900111", humans: { name: "Sarah", surname: "Jones" }, unread_count: 0 },
        ],
      }),
    );

    fireEvent.click(screen.getByLabelText("Select conversation with Sarah Jones"));
    expect(screen.getByRole("region", { name: "Bulk actions" })).toBeInTheDocument();

    // Switching filters wipes the selection.
    fireEvent.click(screen.getByRole("button", { name: /^Unread\b/ }));
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
  });

  it("scrolls the thread to the latest item after messages render", async () => {
    // Opening a conversation scrolls the thread container to the bottom
    // (container.scrollTop = scrollHeight). Spy on the prototype so we can
    // assert the assignment regardless of jsdom's zero layout sizes.
    const origScrollHeight = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "scrollHeight",
    );
    const origScrollTop = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "scrollTop",
    );
    const scrollTopSpy = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 500;
      },
    });
    Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return 0;
      },
      set(value) {
        scrollTopSpy(value);
      },
    });

    try {
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

      await waitFor(() => expect(scrollTopSpy).toHaveBeenCalledWith(500));
    } finally {
      if (origScrollHeight) {
        Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", origScrollHeight);
      } else {
        delete window.HTMLElement.prototype.scrollHeight;
      }
      if (origScrollTop) {
        Object.defineProperty(window.HTMLElement.prototype, "scrollTop", origScrollTop);
      } else {
        delete window.HTMLElement.prototype.scrollTop;
      }
    }
  });

  it("keeps a separate controlled reply draft for each conversation", async () => {
    const conversation = (id, name) => ({
      id,
      human_id: `human-${id}`,
      phone_e164: "+447700900123",
      last_inbound_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      humans: { name },
    });
    const first = conversation("conv-1", "Sarah");
    const second = conversation("conv-2", "Mina");
    const view = renderInbox(baseState({
      conversations: [first, second],
      selectedId: first.id,
      selectedConversation: first,
    }));

    fireEvent.change(screen.getByLabelText("Write a reply"), {
      target: { value: "Draft for Sarah" },
    });

    setInboxState(baseState({
      conversations: [first, second],
      selectedId: second.id,
      selectedConversation: second,
    }));
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <InboxView />
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByLabelText("Write a reply")).toHaveValue(""));
    fireEvent.change(screen.getByLabelText("Write a reply"), {
      target: { value: "Draft for Mina" },
    });

    setInboxState(baseState({
      conversations: [first, second],
      selectedId: first.id,
      selectedConversation: first,
    }));
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <InboxView />
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Write a reply")).toHaveValue("Draft for Sarah"),
    );
  });

  describe("Booking context and slot insertion", () => {
    function bookingConversation(id, name, dogId, dogName) {
      return {
        id,
        human_id: `human-${id}`,
        phone_e164: "+447700900111",
        channel: "whatsapp",
        closed_at: null,
        unread_count: 0,
        humans: {
          name,
          surname: "Jones",
          dogs: [{ id: dogId, name: dogName, size: "small", breed: "Cockapoo" }],
        },
        last_customer_text: `Can I book ${dogName} in?`,
        last_inbound_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        agent_state: { service: "full-groom", dogName, preferredDay: "Monday" },
      };
    }

    const first = bookingConversation("conv-1", "Sarah", "dog-1", "Bella");
    const second = bookingConversation("conv-2", "Mina", "dog-2", "Milo");

    function contextRegion() {
      return screen.getByRole("region", { name: "Booking and customer context" });
    }

    function openBookingSection() {
      fireEvent.click(within(contextRegion()).getByRole("button", { name: /^Booking/ }));
    }

    // Staff now choose the action and the dog explicitly — the message
    // classifier no longer decides for them. See
    // docs/booking-pane-actions-spec.md.
    function startOfferFlow() {
      fireEvent.click(
        within(contextRegion()).getByRole("button", { name: /Available appointments\?/ }),
      );
    }

    function chooseDog(name) {
      fireEvent.click(
        within(contextRegion()).getByRole("checkbox", { name: new RegExp(name) }),
      );
    }

    function chooseSlot(slot) {
      fireEvent.click(within(contextRegion()).getByRole("button", { name: new RegExp(slot) }));
    }

    function addToReply() {
      fireEvent.click(
        within(contextRegion()).getByRole("button", { name: /Add to reply/i }),
      );
    }

    function showConversation(view, conversation) {
      setInboxState(baseState({
        conversations: [first, second],
        selectedId: conversation.id,
        selectedConversation: conversation,
      }));
      view.rerender(
        <MemoryRouter>
          <ToastProvider>
            <InboxView />
          </ToastProvider>
        </MemoryRouter>,
      );
    }

    it("appends the chosen slots to the reply, focuses the composer and closes the overlay", async () => {
      renderInbox(baseState({
        conversations: [first, second],
        selectedId: first.id,
        selectedConversation: first,
      }));

      openBookingSection();
      startOfferFlow();
      chooseDog("Bella");
      chooseSlot("08:30");
      chooseSlot("09:00");

      // The overlay is open while staff pick times.
      expect(
        screen.getByRole("button", { name: "Dismiss booking and customer context" }),
      ).toBeInTheDocument();

      addToReply();

      const composer = screen.getByLabelText("Write a reply");
      expect(composer.value).toContain("Bella");
      expect(composer.value).toContain("at 08:30");
      expect(composer.value).toContain("at 09:00");
      await waitFor(() => expect(composer).toHaveFocus());
      expect(
        screen.queryByRole("button", { name: "Dismiss booking and customer context" }),
      ).not.toBeInTheDocument();
    });

    it("never overwrites reply text staff have already written", () => {
      renderInbox(baseState({
        conversations: [first, second],
        selectedId: first.id,
        selectedConversation: first,
      }));

      fireEvent.change(screen.getByLabelText("Write a reply"), {
        target: { value: "Hiya Sarah, lovely to hear from you!" },
      });

      openBookingSection();
      startOfferFlow();
      chooseDog("Bella");
      chooseSlot("08:30");
      addToReply();

      const value = screen.getByLabelText("Write a reply").value;
      expect(value.startsWith("Hiya Sarah, lovely to hear from you!\n\n")).toBe(true);
      expect(value).toContain("at 08:30");
    });

    it("keeps each conversation's slot choices and inserted reply to itself", async () => {
      const view = renderInbox(baseState({
        conversations: [first, second],
        selectedId: first.id,
        selectedConversation: first,
      }));

      openBookingSection();
      startOfferFlow();
      chooseDog("Bella");
      chooseSlot("08:30");
      chooseSlot("09:00");
      addToReply();
      const sarahReply = screen.getByLabelText("Write a reply").value;
      expect(sarahReply).toContain("Bella");

      // Mina starts clean — no draft and a fresh, unchosen booking flow.
      showConversation(view, second);
      await waitFor(() => expect(screen.getByLabelText("Write a reply")).toHaveValue(""));
      openBookingSection();
      expect(
        within(contextRegion()).getByRole("button", { name: /Available appointments\?/ }),
      ).toBeInTheDocument();

      // Sarah's own reply is intact on return.
      showConversation(view, first);
      await waitFor(() =>
        expect(screen.getByLabelText("Write a reply")).toHaveValue(sarahReply),
      );
    });

    it("surfaces a booking suggestion without opening the Booking section", () => {
      renderInbox(baseState({
        conversations: [first, second],
        selectedId: first.id,
        selectedConversation: first,
      }));

      expect(within(contextRegion()).getByText("Booking suggested")).toBeInTheDocument();
      // Customer stays the open section until staff choose otherwise.
      expect(
        within(contextRegion()).getByRole("button", { name: /^Customer/ }),
      ).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
      expect(screen.queryByText("Booking suggested")).not.toBeInTheDocument();
    });
  });
});
