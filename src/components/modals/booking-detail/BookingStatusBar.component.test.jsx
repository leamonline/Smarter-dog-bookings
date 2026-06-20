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
