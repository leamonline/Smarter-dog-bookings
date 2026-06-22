import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { BookingStatusBar } from "./BookingStatusBar.jsx";
import { BOOKING_STATUS } from "../../../constants/index";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

describe("BookingStatusBar (#299 screen-reader announcement)", () => {
  it("announces the new status via a live region after a successful change", async () => {
    const onUpdate = vi
      .fn()
      .mockResolvedValue({ id: "b1", status: BOOKING_STATUS.CHECKED_IN });
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-06-20"
        onUpdate={onUpdate}
      />,
    );
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("");

    await userEvent.click(
      screen.getByRole("radio", { name: /set status to checked in/i }),
    );

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(liveRegion).toHaveTextContent("Status changed to Checked in");
  });

  it("does not announce when the update fails (onUpdate returns null)", async () => {
    const onUpdate = vi.fn().mockResolvedValue(null);
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-06-20"
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", { name: /set status to in bath/i }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("BookingStatusBar keyboard navigation", () => {
  it("uses roving tabindex — only the checked step is tabbable", () => {
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-06-20"
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /set status to booked/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /set status to checked in/i })).toHaveAttribute("tabindex", "-1");
  });

  it("arrow keys move focus only — they never commit a status change", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue({ id: "b1", status: BOOKING_STATUS.CHECKED_IN });
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-06-20"
        onUpdate={onUpdate}
      />,
    );
    const booked = screen.getByRole("radio", { name: /set status to booked/i });
    const checkedIn = screen.getByRole("radio", { name: /set status to checked in/i });

    booked.focus();
    await user.keyboard("{ArrowRight}");
    expect(checkedIn).toHaveFocus();
    expect(onUpdate).not.toHaveBeenCalled(); // focus moved, nothing committed

    await user.keyboard("{Enter}");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ status: BOOKING_STATUS.CHECKED_IN });
  });

  it("wraps from the last step back to the first with ArrowRight", async () => {
    const user = userEvent.setup();
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.COMPLETED }}
        currentDateStr="2026-06-20"
        onUpdate={vi.fn()}
      />,
    );
    const completed = screen.getByRole("radio", { name: /set status to completed/i });
    const booked = screen.getByRole("radio", { name: /set status to booked/i });
    completed.focus();
    await user.keyboard("{ArrowRight}");
    expect(booked).toHaveFocus();
  });
});
