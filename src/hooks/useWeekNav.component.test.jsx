import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppToolbar } from "../components/layout/AppToolbar.jsx";
import { MobileNavStrip } from "../components/layout/MobileNavStrip.jsx";
import { useWeekNav } from "./useWeekNav.js";

vi.mock("../supabase/hooks/useWhatsAppUnread.js", () => ({
  useWhatsAppUnread: () => ({ unread: 0 }),
}));

vi.mock("../supabase/hooks/usePendingSignupsCount.js", () => ({
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
