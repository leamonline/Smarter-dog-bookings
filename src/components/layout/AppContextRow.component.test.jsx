import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextRow } from "./AppContextRow.jsx";

vi.mock("../../supabase/hooks/useWhatsAppUnread.js", () => ({
  useWhatsAppUnread: () => ({ unread: 2 }),
}));

vi.mock("../../supabase/hooks/useTomorrowReminders.js", () => ({
  useTomorrowReminders: () => ({ sentCount: 1, totalCount: 3, loading: false }),
}));

describe("AppContextRow", () => {
  it("gives Bookings the shared visible heading at every breakpoint", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppContextRow
          dateLabel="Sunday, 19 July 2026"
          isOpen
          dayTone="full"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Bookings" })).toBeVisible();
    expect(screen.getByText("Sunday, 19 July 2026")).toBeInTheDocument();
    expect(screen.getByText("Full today")).toBeInTheDocument();
    expect(screen.getByText("2 to reply")).toBeInTheDocument();
    expect(screen.getByText("1/3 reminders sent")).toBeInTheDocument();
  });

  it("does not add a second page heading away from Bookings", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dogs"]}>
        <AppContextRow dateLabel="Sunday, 19 July 2026" isOpen dayTone="open" />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
