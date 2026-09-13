import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/hooks/useTodos", () => ({
  useTodos: () => ({ todos: [], addTodos: vi.fn() }),
}));
vi.mock("../../supabase/hooks/useWaitlist", () => ({
  useWaitlist: () => ({
    waitlist: [],
    loading: false,
    error: null,
    joinWaitlist: vi.fn(),
    leaveWaitlist: vi.fn(),
  }),
}));
vi.mock("../../supabase/hooks/useTomorrowReminders", () => ({
  useTomorrowReminders: () => ({ totalCount: 0, sentCount: 0 }),
}));
vi.mock("../../supabase/hooks/useDeliveryFailures", () => ({
  useDeliveryFailures: () => ({ count: 0 }),
}));
vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));
vi.mock("./CalendarTabs.jsx", () => ({
  CalendarTabs: () => <div data-testid="week-strip" />,
}));
vi.mock("../shared/PullToRefresh.jsx", () => ({
  PullToRefresh: ({ children }) => children,
}));
vi.mock("../decor/index.jsx", () => ({
  FloatingDecor: () => null,
}));
vi.mock("../dashboard/DashboardShell.jsx", () => ({
  DashboardShell: ({ main }) => <>{main}</>,
}));
vi.mock("../dashboard/LeftSidebar.jsx", () => ({
  LeftSidebar: () => null,
}));
vi.mock("../dashboard/BookingMainPanel.jsx", () => ({
  BookingMainPanel: () => null,
}));
vi.mock("../dashboard/RightWorkflowSidebar.jsx", () => ({
  RightWorkflowSidebar: () => null,
}));
vi.mock("../dashboard/DaySettingsDrawer.jsx", () => ({
  DaySettingsDrawer: () => null,
}));
vi.mock("../dashboard/OverviewDrawer.jsx", () => ({
  OverviewDrawer: () => null,
}));
vi.mock("../dashboard/MiniCalendarCard.jsx", () => ({
  MiniCalendarCard: () => null,
}));
vi.mock("../dashboard/CapacityCard.jsx", () => ({
  CapacityCard: () => null,
}));

import { WeekCalendarView } from "./WeekCalendarView.jsx";
import { SalonProvider } from "../../contexts/SalonContext";

// 21 September 2026 is a Monday.
const currentDateObj = new Date("2026-09-21T12:00:00");

function renderCalendar() {
  const goToPrevWeek = vi.fn();
  const goToNextWeek = vi.fn();
  const handleDatePick = vi.fn();
  render(
    <SalonProvider
      dogs={{}}
      humans={{}}
      dogsByHumanId={{}}
      ensureDogsForHumans={vi.fn()}
      bookingsByDate={{}}
      bookingsLoading={false}
      bookingsError={null}
      daySettings={{}}
      dayOpenState={{ "2026-09-21": true }}
      currentDateStr="2026-09-21"
      currentDateObj={currentDateObj}
      onAdd={vi.fn()}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
      onUpdateDog={vi.fn()}
      onUpdateHuman={vi.fn()}
      onOpenHuman={vi.fn()}
      onOpenDog={vi.fn()}
    >
      <WeekCalendarView
        selectedDay={0}
        setSelectedDay={vi.fn()}
        dates={[{ dateObj: currentDateObj, dateStr: "2026-09-21" }]}
        currentSettings={{ isOpen: true, overrides: {}, extraSlots: [], immediateSlots: [] }}
        handleOverride={vi.fn()}
        toggleImmediateSlot={vi.fn()}
        handleAddSlot={vi.fn()}
        handleRemoveSlot={vi.fn()}
        toggleDayOpen={vi.fn()}
        showDatePicker={false}
        setShowDatePicker={vi.fn()}
        handleDatePick={handleDatePick}
        goToPrevWeek={goToPrevWeek}
        goToNextWeek={goToNextWeek}
        setShowNewBooking={vi.fn()}
        draftPick={null}
        onRefresh={vi.fn()}
      />
    </SalonProvider>,
  );
  return { goToPrevWeek, goToNextWeek, handleDatePick };
}

describe("WeekCalendarView week-strip arrows", () => {
  it("page the strip by a whole week rather than a single day", async () => {
    const user = userEvent.setup();
    const { goToPrevWeek, goToNextWeek, handleDatePick } = renderCalendar();

    // The arrows sit either side of the week pills.
    const strip = screen.getByTestId("week-strip").parentElement.parentElement;
    const prev = screen.getByRole("button", { name: "Previous week" });
    const next = screen.getByRole("button", { name: "Next week" });
    expect(strip).toContainElement(prev);
    expect(strip).toContainElement(next);

    await user.click(next);
    expect(goToNextWeek).toHaveBeenCalledTimes(1);
    expect(goToPrevWeek).not.toHaveBeenCalled();

    await user.click(prev);
    expect(goToPrevWeek).toHaveBeenCalledTimes(1);

    // Neither arrow reaches for the single-day pick — that is the header's job.
    expect(handleDatePick).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Previous day" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next day" })).toBeNull();
  });
});
