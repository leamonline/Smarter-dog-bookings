import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextRow } from "./AppContextRow.jsx";

describe("AppContextRow", () => {
  it("renders simplified date navigation on Bookings page and supports Today action", () => {
    const onNavigateDay = vi.fn();
    const onGoToday = vi.fn();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppContextRow
          dateLabel="Sunday, 19 July 2026"
          onNavigateDay={onNavigateDay}
          onGoToday={onGoToday}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Bookings" })).toBeNull();
    expect(screen.getByText("Sunday, 19 July 2026")).toBeInTheDocument();

    // Check that we don't have the status or count badges anymore
    expect(screen.queryByText("Full today")).toBeNull();
    expect(screen.queryByText("2 to reply")).toBeNull();

    // Verify previous and next buttons are present and work
    const prevBtn = screen.getByRole("button", { name: "Previous day" });
    const nextBtn = screen.getByRole("button", { name: "Next day" });
    const todayBtn = screen.getByRole("button", { name: "Today" });

    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();
    expect(todayBtn).toBeInTheDocument();

    fireEvent.click(prevBtn);
    expect(onNavigateDay).toHaveBeenCalledWith(-1);

    fireEvent.click(nextBtn);
    expect(onNavigateDay).toHaveBeenCalledWith(1);

    fireEvent.click(todayBtn);
    expect(onGoToday).toHaveBeenCalled();
  });

  it("does not render when not on Bookings page", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dogs"]}>
        <AppContextRow dateLabel="Sunday, 19 July 2026" />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
