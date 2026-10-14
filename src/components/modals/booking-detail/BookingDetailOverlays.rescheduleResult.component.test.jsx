import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { BOOKING_STATUS } from "../../../constants/index";
import { BookingDetailOverlays } from "./BookingDetailOverlays.jsx";

// The Reschedule modal used to close and toast "Booking rescheduled" without
// reading updateBooking's answer. A refused move (blocked seat, closed day,
// daily cap) must keep the modal open and say so (#987).

vi.mock("../../../hooks/useGroomPhotos", () => ({
  useGroomPhotos: () => ({ uploadPhoto: vi.fn() }),
}));

// Stand in for the lazy picker: one button that confirms a fixed target.
vi.mock("../RescheduleModal.jsx", () => ({
  RescheduleModal: ({ onConfirm }) => (
    <button type="button" onClick={() => onConfirm("2026-06-02", "09:30", {})}>
      Confirm Move
    </button>
  ),
}));

const booking = {
  id: "b-1",
  dogName: "Bella",
  slot: "09:00",
  size: "medium",
  service: "full-groom",
  status: BOOKING_STATUS.BOOKED,
  payment: "Due at Pick-up",
  addons: [],
  _dogId: "d-1",
  _bookingDate: "2026-06-01",
};

function renderOverlays({ onUpdate, onClose, setShowReschedule }) {
  return render(
    <ToastProvider>
      <BookingDetailOverlays
        booking={booking}
        dogData={null}
        sizeTheme={{}}
        editData={{}}
        setEditData={vi.fn()}
        setSaveError={vi.fn()}
        bookingsByDate={{}}
        daySettings={{}}
        dayOpenState={{}}
        currentDateObj={new Date("2026-06-01")}
        currentDateStr="2026-06-01"
        showDatePicker={false}
        setShowDatePicker={vi.fn()}
        showExitConfirm={false}
        setShowExitConfirm={vi.fn()}
        showReschedule={true}
        setShowReschedule={setShowReschedule}
        showSeries={false}
        setShowSeries={vi.fn()}
        showPhotoUpload={false}
        setShowPhotoUpload={vi.fn()}
        pendingSaveOverride={null}
        confirmSaveOverride={vi.fn()}
        cancelSaveOverride={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onClose={onClose}
      />
    </ToastProvider>,
  );
}

describe("BookingDetailOverlays — Reschedule reads the saved result", () => {
  it("stays open and reports the refusal when updateBooking answers null", async () => {
    const onUpdate = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();
    const setShowReschedule = vi.fn();
    renderOverlays({ onUpdate, onClose, setShowReschedule });
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Move" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]).toEqual([
      expect.objectContaining({ id: "b-1", slot: "09:30" }),
      "2026-06-01",
      "2026-06-02",
    ]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't move Bella");
    expect(alert.textContent).toContain("still on 2026-06-01 at 09:00");
    expect(screen.queryByText("Booking rescheduled")).toBeNull();
    expect(setShowReschedule).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes and says Booking rescheduled once the row came back", async () => {
    const onUpdate = vi.fn().mockImplementation(async (b) => b);
    const onClose = vi.fn();
    const setShowReschedule = vi.fn();
    renderOverlays({ onUpdate, onClose, setShowReschedule });
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Move" }));
    expect(await screen.findByText("Booking rescheduled")).toBeTruthy();
    expect(setShowReschedule).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
