// The empty day's job: the next open day on a closed day, what needs a person
// regardless of the diary, and the Later notes opened. Data hooks are stubbed
// so each branch — loaded, failed, nothing open, nothing waiting — is pinned.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TodayEmptyState, describeDay } from "./TodayEmptyState.jsx";

const nextOpen = {
  loading: false,
  available: true,
  dateStr: "2026-11-16",
  bookings: [],
  noOpenDay: false,
};
const badges = { unread: 0, pendingSignups: 0 };

vi.mock("../../../hooks/useNextOpenDayBrief", () => ({
  useNextOpenDayBrief: () => nextOpen,
}));
vi.mock("../../../supabase/hooks/useWhatsAppUnread", () => ({
  useWhatsAppUnread: () => ({ unread: badges.unread, loading: false }),
}));
vi.mock("../../../supabase/hooks/usePendingSignupsCount", () => ({
  usePendingSignupsCount: () => ({ count: badges.pendingSignups, loading: false }),
}));
vi.mock("../../../hooks/useUnpaidFortnight", () => ({
  useUnpaidFortnight: () => ({ available: true, count: 3 }),
}));
vi.mock("../../../hooks/useRetentionData", () => ({
  useRetentionData: () => ({ available: false, overdueCount: 0 }),
}));

afterEach(() => {
  Object.assign(nextOpen, { loading: false, available: true, dateStr: "2026-11-16", bookings: [], noOpenDay: false });
  badges.unread = 0;
  badges.pendingSignups = 0;
});

const booking = (slot) => ({ id: slot, slot, payment: "Due at Pick-up", addons: null, priceOverride: null });

function renderEmpty(props = {}) {
  return render(
    <MemoryRouter>
      <TodayEmptyState
        dateStr="2026-11-14"
        isToday
        isDayOpen={false}
        isOnline
        notesReady
        onGoToDate={vi.fn()}
        onManageAvailability={vi.fn()}
        onOpenReports={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("describeDay", () => {
  it("counts the dogs and names the earliest slot", () => {
    expect(describeDay([booking("10:00"), booking("09:00"), booking("12:30")])).toBe(
      "3 dogs booked · first at 09:00",
    );
    expect(describeDay([booking("08:30")])).toBe("1 dog booked · first at 08:30");
    expect(describeDay([])).toBe("Nothing booked yet");
  });
});

describe("TodayEmptyState — closed day", () => {
  it("names the next open day, what is booked on it, and goes there", () => {
    nextOpen.bookings = [booking("09:00"), booking("09:30"), booking("11:00")];
    const onGoToDate = vi.fn();
    renderEmpty({ onGoToDate });

    const next = screen.getByRole("region", { name: "Next open day" });
    expect(next).toHaveTextContent("Closed today · next open day");
    expect(next).toHaveTextContent("Monday 16 November");
    expect(next).toHaveTextContent("3 dogs booked · first at 09:00");
    fireEvent.click(within(next).getByRole("button", { name: "Go to Monday 16 November" }));
    expect(onGoToDate).toHaveBeenCalledWith("2026-11-16");
  });

  it("says it could not check, rather than 'Nothing booked', when the read failed online", () => {
    nextOpen.available = false;
    renderEmpty();
    const next = screen.getByRole("region", { name: "Next open day" });
    expect(next).toHaveTextContent("Couldn't check its bookings");
    expect(next).not.toHaveTextContent("Nothing booked");
  });

  it("asserts nothing about the diary in sample mode", () => {
    nextOpen.available = false;
    renderEmpty({ isOnline: false });
    const next = screen.getByRole("region", { name: "Next open day" });
    expect(next).toHaveTextContent("Monday 16 November");
    expect(next).not.toHaveTextContent("Nothing booked");
    expect(next).not.toHaveTextContent("Couldn't check");
  });

  it("says when no day in the lookahead is open", () => {
    Object.assign(nextOpen, { dateStr: null, noOpenDay: true });
    renderEmpty();
    expect(screen.getByText("No open days in the next 10 days.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Go to/ })).not.toBeInTheDocument();
  });

  it("does not offer Manage availability on a closed day", () => {
    renderEmpty();
    expect(screen.queryByRole("button", { name: "Manage availability" })).not.toBeInTheDocument();
  });
});

describe("TodayEmptyState — what needs you", () => {
  it("lists unread messages and approvals as links to where they are dealt with", () => {
    badges.unread = 19;
    badges.pendingSignups = 1;
    renderEmpty();

    const needsYou = screen.getByRole("region", { name: "Needs you" });
    expect(within(needsYou).getByRole("link", { name: "19 unread messages" })).toHaveAttribute("href", "/inbox");
    expect(
      within(needsYou).getByRole("link", { name: "1 new customer awaiting approval" }),
    ).toHaveAttribute("href", "/humans");
  });

  it("stays out of the way when nothing is waiting", () => {
    renderEmpty();
    expect(screen.queryByRole("region", { name: "Needs you" })).not.toBeInTheDocument();
  });

  it("opens the Later notes, since they are the day's remaining work", () => {
    const { container } = renderEmpty();
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("3 unpaid grooms")).toBeInTheDocument();
  });
});

describe("TodayEmptyState — open day", () => {
  it("offers Manage availability on today while slots are free", () => {
    const onManageAvailability = vi.fn();
    renderEmpty({ isDayOpen: true, hasFreeSlots: true, onManageAvailability });
    const empty = screen.getByRole("region", { name: "No bookings" });
    expect(empty).toHaveTextContent("No bookings today");
    fireEvent.click(within(empty).getByRole("button", { name: "Manage availability" }));
    expect(onManageAvailability).toHaveBeenCalledTimes(1);
  });

  it("does not offer it once today's slots have all passed", () => {
    renderEmpty({ isDayOpen: true, hasFreeSlots: false });
    expect(screen.queryByRole("button", { name: "Manage availability" })).not.toBeInTheDocument();
  });

  it("does not offer it on another date", () => {
    renderEmpty({ isDayOpen: true, isToday: false, hasFreeSlots: true });
    expect(screen.getByRole("region", { name: "No bookings" })).toHaveTextContent("No bookings on this date");
    expect(screen.queryByRole("button", { name: "Manage availability" })).not.toBeInTheDocument();
  });
});
