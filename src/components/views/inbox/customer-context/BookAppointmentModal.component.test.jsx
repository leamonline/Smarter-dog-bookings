import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// The capacity preview fetches bookings via Supabase; stub it so this
// test stays focused on the form's validation + payload.
vi.mock("../thread/BookingCapacityPreview.jsx", () => ({
  BookingCapacityPreview: () => null,
}));

import { BookAppointmentModal } from "./BookAppointmentModal.jsx";

const conversation = { id: "conv-1", phone_e164: "+447700900123", humans: { name: "Jo" } };
const dogs = [
  { id: "dog-1", name: "Bella", breed: "Cockapoo", size: "medium", alerts: [] },
  { id: "dog-2", name: "Max", breed: "Lab", size: "large", alerts: [] },
];

describe("BookAppointmentModal", () => {
  it("submits the selected dog/date/slot/service/size as the booking payload", async () => {
    const onBook = vi.fn(() => Promise.resolve({ ok: true, bookingId: "b-1" }));
    const onClose = vi.fn();
    render(
      <BookAppointmentModal
        conversation={conversation}
        dogs={dogs}
        onBook={onBook}
        onClose={onClose}
      />,
    );

    // Add to diary is disabled until date + slot are chosen (dog, service,
    // size all default).
    const submit = screen.getByRole("button", { name: "Add to diary" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-20" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } });
    // Size defaulted to the first dog's size (medium).
    expect(screen.getByLabelText("Size")).toHaveValue("medium");

    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onBook).toHaveBeenCalledTimes(1));
    expect(onBook).toHaveBeenCalledWith({
      dog_id: "dog-1",
      booking_date: "2026-06-20",
      slot: "09:30",
      service: "full-groom",
      size: "medium",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("defaults the size to the chosen dog's size when the dog changes", () => {
    render(
      <BookAppointmentModal
        conversation={conversation}
        dogs={dogs}
        onBook={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Dog"), { target: { value: "dog-2" } });
    expect(screen.getByLabelText("Size")).toHaveValue("large");
  });

  it("surfaces the failure reason and keeps the modal open", async () => {
    const onBook = vi.fn(() => Promise.resolve({ ok: false, reason: "slot is full" }));
    const onClose = vi.fn();
    render(
      <BookAppointmentModal
        conversation={conversation}
        dogs={dogs}
        onBook={onBook}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-20" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to diary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("slot is full");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains when the customer has no dogs on file", () => {
    render(
      <BookAppointmentModal
        conversation={conversation}
        dogs={[]}
        onBook={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no dogs on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to diary" })).toBeDisabled();
  });
});
