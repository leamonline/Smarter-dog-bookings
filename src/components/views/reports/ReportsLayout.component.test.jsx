import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ReportsLayout } from "./ReportsLayout.jsx";

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
});
