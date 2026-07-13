import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BookingDetailModal } from "./BookingDetailModal.jsx";

vi.mock("../../hooks/useGroomPhotos.js", () => ({
  useGroomPhotos: () => ({
    fetchPhotosForDog: vi.fn(() => Promise.resolve([])),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    updatePhotoNotes: vi.fn(),
  }),
}));

vi.mock("../../supabase/hooks/useStaffName.js", () => ({
  useStaffName: () => ({ name: "" }),
}));

const dog = {
  id: "dog-1",
  name: "Bella",
  breed: "Cockapoo",
  size: "small",
  humanId: "human-1",
  alerts: [],
  groomNotes: "",
};

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700900111",
  sms: true,
  whatsapp: true,
  reminderChannels: ["whatsapp"],
  trustedIds: [],
  trustedContacts: [],
};

const booking = {
  id: "b-1",
  dogName: "Bella",
  breed: "Cockapoo",
  size: "small",
  service: "full-groom",
  owner: "Sarah Jones",
  status: "Booked",
  slot: "09:00",
  addons: [],
  pickupBy: "Sarah Jones",
  payment: "Due at Pick-up",
  depositAmount: null,
  _dogId: "dog-1",
  _ownerId: "human-1",
  _pickupById: "human-1",
  _bookingDate: "2026-05-18",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("BookingDetailModal deposit autosave validation", () => {
  it("keeps invalid deposit edits unsaved and never announces Saved", async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();

    render(
      <MemoryRouter>
        <ToastProvider>
          <BookingDetailModal
            booking={booking}
            onClose={vi.fn()}
            onAdd={vi.fn()}
            onRemove={vi.fn()}
            onOpenHuman={vi.fn()}
            onMessageOwner={vi.fn()}
            onOpenDog={vi.fn()}
            onUpdate={onUpdate}
            currentDateStr="2026-05-18"
            currentDateObj={new Date("2026-05-18T00:00:00Z")}
            bookingsByDate={{ "2026-05-18": [booking] }}
            dayOpenState={{ "2026-05-18": true }}
            dogs={{ Bella: dog }}
            humans={{ "Sarah Jones": human }}
            onUpdateDog={vi.fn()}
            daySettings={{}}
          />
        </ToastProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit booking" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Payment status" }), {
      target: { value: "Deposit Paid" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deposit amount" }), {
      target: { value: "42" },
    });

    expect(screen.getByRole("spinbutton", { name: "Deposit amount" })).toHaveValue(42);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Deposit must be less than the booking total").length,
    ).toBeGreaterThan(0);
    for (const status of screen.getAllByRole("status")) {
      expect(status).not.toHaveTextContent("Saved");
    }

    // A failed autosave must not advance the hook's baseline. Restoring the
    // original edit data is therefore unchanged and must not trigger a save.
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deposit amount" }), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Payment status" }), {
      target: { value: "Due at Pick-up" },
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
