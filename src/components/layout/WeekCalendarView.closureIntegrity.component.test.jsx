import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addTodos: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../supabase/hooks/useTodos", () => ({
  useTodos: () => ({
    todos: [],
    addTodos: mocks.addTodos,
  }),
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
  useToast: () => ({ show: mocks.showToast }),
}));
vi.mock("./CalendarTabs.jsx", () => ({
  CalendarTabs: () => null,
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
  BookingMainPanel: ({ onCloseDay }) => (
    <button type="button" onClick={onCloseDay}>
      Test close day
    </button>
  ),
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

const currentDateObj = new Date("2026-08-10T12:00:00");

// The calendar reads shared salon data from SalonContext (Debt 11), so the
// harness provides it the way App.jsx does; unrelated provider props are stubs.
function renderCalendar(toggleDayOpen) {
  return render(
    <SalonProvider
      dogs={{}}
      humans={{}}
      dogsByHumanId={{}}
      ensureDogsForHumans={vi.fn()}
      bookingsByDate={{
        "2026-08-10": [
          {
            id: "booking-1",
            dogName: "Alfie",
            owner: "Alex Taylor",
            slot: "09:00",
            status: "Booked",
          },
        ],
      }}
      bookingsLoading={false}
      bookingsError={null}
      daySettings={{}}
      dayOpenState={{ "2026-08-10": true }}
      currentDateStr="2026-08-10"
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
      dates={[
        {
          dateObj: currentDateObj,
          dateStr: "2026-08-10",
        },
      ]}
      currentSettings={{
        isOpen: true,
        overrides: {},
        extraSlots: [],
        immediateSlots: [],
      }}
      handleOverride={vi.fn()}
      toggleImmediateSlot={vi.fn()}
      handleAddSlot={vi.fn()}
      handleRemoveSlot={vi.fn()}
      toggleDayOpen={toggleDayOpen}
      showDatePicker={false}
      setShowDatePicker={vi.fn()}
      handleDatePick={vi.fn()}
      setShowNewBooking={vi.fn()}
      draftPick={null}
      onRefresh={vi.fn()}
    />
    </SalonProvider>,
  );
}

describe("WeekCalendarView closure integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates closure and task creation to one atomic command", async () => {
    const user = userEvent.setup();
    const toggleDayOpen = vi.fn().mockResolvedValue({ ok: true });
    renderCalendar(toggleDayOpen);

    await user.click(screen.getByRole("button", { name: "Test close day" }));
    await user.click(
      screen.getByRole("button", { name: "Yes, close it" }),
    );

    expect(toggleDayOpen).toHaveBeenCalledOnce();
    expect(toggleDayOpen).toHaveBeenCalledWith(false);
    expect(mocks.addTodos).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Close this day?" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and reports an atomic closure failure", async () => {
    const user = userEvent.setup();
    const toggleDayOpen = vi.fn().mockResolvedValue({
      ok: false,
      error: "The day could not be closed",
    });
    renderCalendar(toggleDayOpen);

    await user.click(screen.getByRole("button", { name: "Test close day" }));
    await user.click(
      screen.getByRole("button", { name: "Yes, close it" }),
    );

    expect(mocks.showToast).toHaveBeenCalledWith(
      "The day could not be closed",
      "error",
    );
    expect(
      screen.getByRole("heading", { name: "Close this day?" }),
    ).toBeInTheDocument();
  });

  it("submits only one closure while the atomic command is in flight", async () => {
    const user = userEvent.setup();
    let resolveClosure;
    const closurePromise = new Promise((resolve) => {
      resolveClosure = resolve;
    });
    const toggleDayOpen = vi.fn(() => closurePromise);
    renderCalendar(toggleDayOpen);

    await user.click(screen.getByRole("button", { name: "Test close day" }));
    const confirm = screen.getByRole("button", { name: "Yes, close it" });
    await user.click(confirm);
    await user.click(confirm);

    expect(toggleDayOpen).toHaveBeenCalledOnce();

    resolveClosure({ ok: true });
  });
});
