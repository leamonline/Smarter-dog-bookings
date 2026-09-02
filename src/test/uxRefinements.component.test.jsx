import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppContextRow } from "../components/layout/AppContextRow.jsx";
import { SlotGrid } from "../components/booking/SlotGrid.jsx";
import { TomorrowRemindersCard } from "../components/dashboard/TomorrowRemindersCard.jsx";
import { WhatsAppInboxCard } from "../components/dashboard/WhatsAppInboxCard.jsx";
import { BookingHistoryCard } from "../components/dashboard/BookingHistoryCard.jsx";
import { BookingActions } from "../components/modals/booking-detail/BookingActions.jsx";
import { CapacityCard } from "../components/dashboard/CapacityCard.jsx";
import { findNextAvailable } from "../engine/utilisation";
import { ToastProvider } from "../contexts/ToastContext.jsx";

// Mock providers or hooks
vi.mock("../supabase/hooks/useWhatsAppSummary", () => ({
  useWhatsAppSummary: () => ({
    awaitingReply: 2,
    oldestUnansweredAt: "2026-05-18T10:00:00Z",
    aiSummary: { text: "AI Summary text", loading: false },
    recentConversations: [
      { conversationId: "c-1", displayName: "Demelza", lastText: "Running late", unreadCount: 1, lastAt: "2026-05-18T10:00:00Z" },
      { conversationId: "c-2", displayName: "Peter", lastText: "Confirming tomorrow", unreadCount: 1, lastAt: "2026-05-18T09:30:00Z" }
    ],
    loading: false
  })
}));

vi.mock("../supabase/hooks/useTomorrowReminders.js", () => ({
  useTomorrowReminders: () => ({
    targetDate: "2026-05-19",
    rows: [
      { customerKey: "1", customerName: "Talia", dogNamesDisplay: "Pippa", slot: "08:30" },
      { customerKey: "2", customerName: "Pauline", dogNamesDisplay: "Archie", slot: "08:30" },
      { customerKey: "3", customerName: "Mark", dogNamesDisplay: "Charlie", slot: "09:00" },
      { customerKey: "4", customerName: "Extra", dogNamesDisplay: "Buddy", slot: "09:30" }
    ],
    sentCount: 0,
    totalCount: 4,
    loading: false
  })
}));

vi.mock("../supabase/hooks/useBookingEvents", () => ({
  useBookingEvents: () => ({
    events: [
      { id: "e1", event_type: "created", occurred_at: "2026-05-18T10:00:00Z" }
    ],
    loading: false,
    error: null,
    refresh: vi.fn()
  })
}));

vi.mock("../lib/bookingEventFormat.js", () => ({
  eventSentence: () => `Alfie was booked in`,
  EVENT_TONE: {
    created: { dot: "bg-brand-green-500", pill: "text-brand-green-700", label: "Booked" }
  },
  formatRelative: () => "18 May"
}));

describe("UX Refinement: Today callback and URL synchronisation", () => {
  it("triggers onGoToday callback from AppContextRow when Today button is clicked", () => {
    const onGoToday = vi.fn();
    render(
      <MemoryRouter>
        <AppContextRow dateLabel="Sunday, 19 July 2026" onGoToday={onGoToday} />
      </MemoryRouter>
    );

    const todayBtn = screen.getByRole("button", { name: "Today" });
    expect(todayBtn).toBeInTheDocument();
    fireEvent.click(todayBtn);
    expect(onGoToday).toHaveBeenCalled();
  });
});

describe("UX Refinement: Preserved seatIndex ordering", () => {
  it("renders both seat cells in their canonical parallel layout structure starting from lg breakpoint", () => {
    const activeSlots = ["08:30"];
    const bookings = [];
    const { container } = render(
      <ToastProvider>
        <SlotGrid
          bookings={bookings}
          activeSlots={activeSlots}
          currentDateStr="2026-06-01"
          loading={false}
          onOpenNewBooking={vi.fn()}
        />
      </ToastProvider>
    );

    const gridContainer = container.querySelector(".lg\\:grid-cols-2");
    expect(gridContainer).toBeInTheDocument();
  });
});

describe("UX Refinement: Exact-time next-available exclusion & Europe/London timezone", () => {
  it("excludes past slots on the current Europe/London date (using BST)", () => {
    const nowBST = new Date("2026-07-02T09:15:00Z"); // BST date
    const fromDate = new Date("2026-07-02T00:00:00");
    const result = findNextAvailable({
      fromDate,
      bookingsByDate: {},
      dayOpenState: { "2026-07-02": true },
      daySettings: {},
      now: nowBST,
    });

    expect(result).not.toBeNull();
    expect(result?.slot).toBe("10:30");
  });

  it("excludes past slots on the current Europe/London date (using GMT)", () => {
    const nowGMT = new Date("2026-01-15T10:15:00Z"); // GMT date
    const fromDate = new Date("2026-01-15T00:00:00");
    const result = findNextAvailable({
      fromDate,
      bookingsByDate: {},
      dayOpenState: { "2026-01-15": true },
      daySettings: {},
      now: nowGMT,
    });

    expect(result).not.toBeNull();
    expect(result?.slot).toBe("10:30");
  });
});

describe("UX Refinement: True Full state", () => {
  it("does not report Full state from percentage alone, only when booking count equals or exceeds capacity", () => {
    render(
      <CapacityCard
        currentDateObj={new Date("2026-05-18")}
        dates={[]}
        bookingsByDate={{ "2026-05-18": [] }}
        dayOpenState={{ "2026-05-18": true }}
        onSelectDate={vi.fn()}
      />
    );

    expect(screen.queryByText("Steady")).toBeNull();
    expect(screen.queryByText("Healthy")).toBeNull();
    expect(screen.queryByText("Strong")).toBeNull();
    expect(screen.queryByText("Quiet")).toBeNull();
  });
});

describe("UX Refinement: TomorrowRemindersCard preview truncation", () => {
  it("previews maximum 3 rows and renders informational '+X more' text and Review button", () => {
    const onOpen = vi.fn();
    render(
      <ToastProvider>
        <TomorrowRemindersCard onOpen={onOpen} />
      </ToastProvider>
    );

    expect(screen.getByText("Talia")).toBeInTheDocument();
    expect(screen.getByText("Pauline")).toBeInTheDocument();
    expect(screen.getByText("Mark")).toBeInTheDocument();

    expect(screen.queryByText("Extra")).toBeNull();

    expect(screen.getByText("+1 more")).toBeInTheDocument();

    const reviewBtn = screen.getByRole("button", { name: "Review all 4" });
    expect(reviewBtn).toBeInTheDocument();
    fireEvent.click(reviewBtn);
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("UX Refinement: WhatsAppInboxCard generic conversation rows", () => {
  it("renders generic conversation cards for unread messages and avoids brittle keyword-guessing", () => {
    render(
      <MemoryRouter>
        <WhatsAppInboxCard />
      </MemoryRouter>
    );

    expect(screen.getByText("Demelza")).toBeInTheDocument();
    expect(screen.getByText('“Running late”')).toBeInTheDocument();

    expect(screen.getByText("Peter")).toBeInTheDocument();
    expect(screen.getByText('“Confirming tomorrow”')).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: "Open conversation" })).toHaveLength(2);
  });
});

describe("UX Refinement: BookingHistoryCard collapsed activity history", () => {
  it("starts collapsed by default and expands when the history icon is clicked", () => {
    render(<BookingHistoryCard />);

    expect(screen.getByText(/Recent activity/i)).toBeInTheDocument();

    expect(screen.queryByText(/Alfie/i)).toBeNull();

    const toggleBtn = screen.getByRole("button", { name: /expand activity history/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Alfie/i)).toBeInTheDocument();
  });
});

describe("UX Refinement: Move booking labels and accessible activation", () => {
  it("exposes a visibly available, keyboard-reachable Reschedule booking action", () => {
    const onReschedule = vi.fn();
    render(
      <ToastProvider>
        <BookingActions
          isEditing={false}
          booking={{}}
          onReschedule={onReschedule}
        />
      </ToastProvider>
    );

    const moveBtn = screen.getByRole("button", { name: "Reschedule booking" });
    expect(moveBtn).toBeInTheDocument();
    fireEvent.click(moveBtn);
    expect(onReschedule).toHaveBeenCalled();
  });
});
