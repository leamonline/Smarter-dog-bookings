import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SALON_SLOTS } from "../../constants/index";
import { RescheduleModal } from "./RescheduleModal.jsx";

// 2026-06-01 is a Monday. The picker spans the viewed day (Jun 1) … Jun 8.
const MONDAY = new Date(2026, 5, 1);

function modalProps(overrides = {}) {
  return {
    booking: { id: "b1", dogName: "Bella", size: "small", _dogId: "d1" },
    currentDateObj: MONDAY,
    bookingsByDate: {},
    daySettings: {},
    dayOpenState: {},
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("RescheduleModal — same-day moves", () => {
  it("offers the viewed day so a booking can be moved to another slot the same day", () => {
    render(<RescheduleModal {...modalProps({ dayOpenState: { "2026-06-01": true } })} />);
    // The viewed day (Mon 1 Jun) is now selectable — the keyboard/tap
    // equivalent of dragging a card to a different slot on the same day.
    expect(screen.getByRole("button", { name: /1 Jun/ })).toBeEnabled();
  });
});

describe("RescheduleModal — closed days", () => {
  it("disables a closed day and leaves an open day selectable", () => {
    render(
      <RescheduleModal
        {...modalProps({ dayOpenState: { "2026-06-02": true, "2026-06-03": false } })}
      />,
    );
    expect(screen.getByRole("button", { name: /2 Jun/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /3 Jun/ })).toBeDisabled();
  });

  it("clears the chosen slot and warns when the selected day becomes closed", () => {
    const props = modalProps({ dayOpenState: { "2026-06-02": true } });
    const { rerender } = render(<RescheduleModal {...props} />);

    // Select the open day, then a slot — Confirm becomes available.
    fireEvent.click(screen.getByRole("button", { name: /2 Jun/ }));
    fireEvent.click(screen.getByRole("button", { name: SALON_SLOTS[0] }));
    expect(screen.getByRole("button", { name: /confirm reschedule/i })).toBeEnabled();

    // The day closes underneath the selection (e.g. staff closed it elsewhere).
    rerender(
      <RescheduleModal {...modalProps({ dayOpenState: { "2026-06-02": false } })} />,
    );

    expect(screen.getByText(/closed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm reschedule/i })).toBeDisabled();
  });
});
