import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { BookingStatusBar } from "./BookingStatusBar.jsx";
import { BOOKING_STATUS } from "../../../constants/index";

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: showToast, dismiss: vi.fn() }),
}));

beforeEach(() => {
  showToast.mockClear();
});

describe("BookingStatusBar (#299 screen-reader announcement)", () => {
  it("announces the new status via a live region after a successful change", async () => {
    const onUpdate = vi
      .fn()
      .mockResolvedValue({ id: "b1", status: BOOKING_STATUS.ARRIVED });
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
    expect(liveRegion).toHaveTextContent("All set — status updated to Checked in");
  });

  it("undoes a successful change using the captured previous status", async () => {
    const onUpdate = vi
      .fn()
      .mockResolvedValue({ id: "b1", status: BOOKING_STATUS.ARRIVED });
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-06-20"
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", { name: /set status to checked in/i }),
    );
    const undo = showToast.mock.calls[0][2];
    await undo();

    expect(onUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: BOOKING_STATUS.BOOKED }),
      "2026-06-20",
      "2026-06-20",
    );
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
    const onUpdate = vi.fn().mockResolvedValue({ id: "b1", status: BOOKING_STATUS.ARRIVED });
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
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ status: BOOKING_STATUS.ARRIVED });
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

describe("BookingStatusBar update safety", () => {
  it("marks Checked in as the next step when Booked", () => {
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-07-13"
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("radio", { name: /set status to checked in/i }),
    ).toHaveAttribute("data-next", "true");
  });

  it("does not mark a next step when Completed", () => {
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.COMPLETED }}
        currentDateStr="2026-07-13"
        onUpdate={vi.fn()}
      />,
    );

    screen.getAllByRole("radio").forEach((control) => {
      expect(control).not.toHaveAttribute("data-next");
    });
  });

  it("disables every status while an update is pending", async () => {
    let resolveUpdate;
    const onUpdate = vi.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-07-13"
        onUpdate={onUpdate}
      />,
    );

    const checkedIn = screen.getByRole("radio", { name: /set status to checked in/i });
    await userEvent.click(checkedIn);

    screen.getAllByRole("radio").forEach((control) => {
      expect(control).toBeDisabled();
    });
    expect(checkedIn).toHaveAttribute("aria-busy", "true");

    resolveUpdate({ id: "b1", status: BOOKING_STATUS.ARRIVED });
    await waitFor(() => {
      screen.getAllByRole("radio").forEach((control) => {
        expect(control).toBeEnabled();
      });
    });
  });

  it("keeps Booked checked and re-enables controls when the update fails", async () => {
    let resolveUpdate;
    const onUpdate = vi.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-07-13"
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", { name: /set status to checked in/i }),
    );
    screen.getAllByRole("radio").forEach((control) => {
      expect(control).toBeDisabled();
    });
    resolveUpdate(null);

    await waitFor(() => {
      screen.getAllByRole("radio").forEach((control) => {
        expect(control).toBeEnabled();
      });
    });
    expect(
      screen.getByRole("radio", { name: /set status to booked/i }),
    ).toBeChecked();
  });

  it("handles a rejected update without leaking success or leaving controls disabled", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("save failed"));
    render(
      <BookingStatusBar
        booking={{ id: "b1", status: BOOKING_STATUS.BOOKED }}
        currentDateStr="2026-07-13"
        onUpdate={onUpdate}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", { name: /set status to checked in/i }),
    );
    await waitFor(() => {
      screen.getAllByRole("radio").forEach((control) => {
        expect(control).toBeEnabled();
      });
    });

    expect(showToast).toHaveBeenCalledWith("Couldn't update status — try again", "error");
    expect(showToast).not.toHaveBeenCalledWith(expect.stringMatching(/saved/i), expect.anything(), expect.anything());
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(
      screen.getByRole("radio", { name: /set status to booked/i }),
    ).toBeChecked();
  });
});
