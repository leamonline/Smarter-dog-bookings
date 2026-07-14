import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useWeekNav } from "./useWeekNav.js";

function WeekNavHarness() {
  useWeekNav();
  const location = useLocation();
  return <output aria-label="Current search">{location.search}</output>;
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
