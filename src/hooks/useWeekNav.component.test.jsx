import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppToolbar } from "../components/layout/AppToolbar.jsx";
import { MobileNavStrip } from "../components/layout/MobileNavStrip.jsx";
import { useWeekNav } from "./useWeekNav";

vi.mock("../supabase/hooks/useWhatsAppUnread", () => ({
  useWhatsAppUnread: () => ({ unread: 0 }),
}));

vi.mock("../supabase/hooks/usePendingSignupsCount", () => ({
  usePendingSignupsCount: () => ({ count: 0 }),
}));

function WeekNavHarness() {
  useWeekNav();
  const location = useLocation();
  return <output aria-label="Current search">{location.search}</output>;
}

function NavigationHarness({ mobile = false }) {
  const { currentDateStr, handleDatePick } = useWeekNav();
  const location = useLocation();

  return (
    <>
      <button type="button" onClick={() => handleDatePick(new Date(2026, 6, 16))}>
        Select 16 July
      </button>
      {mobile ? (
        <MobileNavStrip currentDateStr={currentDateStr} />
      ) : (
        <AppToolbar currentDateStr={currentDateStr} isOnline={false} />
      )}
      <output aria-label="Current location">{location.pathname}{location.search}</output>
    </>
  );
}

async function expectDailyBriefNavigationKeepsSelectedDate(mobile) {
  render(
    <MemoryRouter initialEntries={["/dogs"]}>
      <NavigationHarness mobile={mobile} />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Select 16 July" }));
  await waitFor(() => {
    expect(screen.getByLabelText("Current location")).toHaveTextContent("/dogs?date=2026-07-16");
  });

  const primaryNav = screen.getByRole("navigation", { name: "Primary" });
  fireEvent.click(within(primaryNav).getByRole("link", { name: "Daily Brief" }));

  await waitFor(() => {
    expect(screen.getByLabelText("Current location")).toHaveTextContent("/today?date=2026-07-16");
  });
}

describe("useWeekNav query parameter synchronisation", () => {
  it("preserves unrelated query parameters when adding the selected date", async () => {
    render(
      <MemoryRouter initialEntries={["/reports/insights?period=90"]}>
        <WeekNavHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Current search")).toHaveTextContent("date=");
    });
    expect(screen.getByLabelText("Current search")).toHaveTextContent("period=90");
  });
});

describe("Daily Brief navigation", () => {
  it("keeps the in-memory selected date in the desktop navigation URL", async () => {
    await expectDailyBriefNavigationKeepsSelectedDate(false);
  });

  it("keeps the in-memory selected date in the mobile navigation URL", async () => {
    await expectDailyBriefNavigationKeepsSelectedDate(true);
  });
});

// The Bookings page has two arrow pairs: the week-strip arrows (either side
// of the MON…SUN pills) page by a whole week, and the header arrows either
// side of "Monday, 21 September 2026" step by one day. This harness drives
// the hook the way those two pairs do and reads back the rendered week.
function ArrowPairsHarness() {
  const { dates, selectedDay, currentDateStr, currentDateObj, goToPrevWeek, goToNextWeek, handleDatePick } =
    useWeekNav();
  const navigateDay = (delta) => {
    const target = new Date(currentDateObj);
    target.setDate(target.getDate() + delta);
    handleDatePick(target);
  };
  return (
    <>
      <button type="button" onClick={() => handleDatePick(new Date(2026, 8, 21))}>
        Select 21 September
      </button>
      <button type="button" onClick={goToPrevWeek}>Previous week</button>
      <button type="button" onClick={goToNextWeek}>Next week</button>
      <button type="button" onClick={() => navigateDay(-1)}>Previous day</button>
      <button type="button" onClick={() => navigateDay(1)}>Next day</button>
      <output aria-label="Selected date">{currentDateStr}</output>
      <output aria-label="Selected day index">{selectedDay}</output>
      <output aria-label="Week strip">{dates.map((d) => d.dateStr).join(",")}</output>
    </>
  );
}

describe("useWeekNav arrow pairs", () => {
  function renderArrows() {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ArrowPairsHarness />
      </MemoryRouter>,
    );
    // 21 September 2026 is a Monday.
    fireEvent.click(screen.getByRole("button", { name: "Select 21 September" }));
    expect(screen.getByLabelText("Selected date")).toHaveTextContent("2026-09-21");
    expect(screen.getByLabelText("Selected day index")).toHaveTextContent("0");
  }

  it("week-strip arrows move ±7 days and keep the selected weekday", () => {
    renderArrows();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByLabelText("Selected date")).toHaveTextContent("2026-09-28");
    expect(screen.getByLabelText("Selected day index")).toHaveTextContent("0");
    expect(screen.getByLabelText("Week strip")).toHaveTextContent(
      "2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2026-10-03,2026-10-04",
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByLabelText("Selected date")).toHaveTextContent("2026-09-14");
    expect(screen.getByLabelText("Week strip")).toHaveTextContent(
      "2026-09-14,2026-09-15,2026-09-16,2026-09-17,2026-09-18,2026-09-19,2026-09-20",
    );
  });

  it("header arrows still move ±1 day, rolling the strip only across a week boundary", () => {
    renderArrows();

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByLabelText("Selected date")).toHaveTextContent("2026-09-22");
    expect(screen.getByLabelText("Selected day index")).toHaveTextContent("1");
    // Same week: the strip does not move.
    expect(screen.getByLabelText("Week strip")).toHaveTextContent("2026-09-21,");

    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    // Sunday 20 September belongs to the previous week's strip.
    expect(screen.getByLabelText("Selected date")).toHaveTextContent("2026-09-20");
    expect(screen.getByLabelText("Selected day index")).toHaveTextContent("6");
    expect(screen.getByLabelText("Week strip")).toHaveTextContent("2026-09-14,");
  });
});
