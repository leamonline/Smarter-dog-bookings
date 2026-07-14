import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ReportsLayout } from "./ReportsLayout.jsx";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current location">{`${location.pathname}${location.search}`}</output>;
}

describe("ReportsLayout", () => {
  it("navigates between Cash-up and Insights with nested routes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/reports/cash-up"]}>
        <Routes>
          <Route path="/reports" element={<ReportsLayout />}>
            <Route path="cash-up" element={<div>Cash-up body</div>} />
            <Route path="insights" element={<div>Insights body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Cash-up" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("link", { name: "Insights" }));
    expect(screen.getByText("Insights body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
  });

  it("preserves report query state through an Insights to Cash-up round trip", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/reports/insights?period=90&date=2026-07-14"]}>
        <LocationProbe />
        <Routes>
          <Route path="/reports" element={<ReportsLayout />}>
            <Route path="cash-up" element={<div>Cash-up body</div>} />
            <Route path="insights" element={<div>Insights body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const cashUp = screen.getByRole("link", { name: "Cash-up" });
    const insights = screen.getByRole("link", { name: "Insights" });
    expect(insights).toHaveAttribute("aria-current", "page");

    await user.click(cashUp);
    expect(screen.getByLabelText("Current location")).toHaveTextContent(
      "/reports/cash-up?period=90&date=2026-07-14",
    );
    expect(cashUp).toHaveAttribute("aria-current", "page");

    await user.click(insights);
    expect(screen.getByLabelText("Current location")).toHaveTextContent(
      "/reports/insights?period=90&date=2026-07-14",
    );
    expect(insights).toHaveAttribute("aria-current", "page");
  });
});
