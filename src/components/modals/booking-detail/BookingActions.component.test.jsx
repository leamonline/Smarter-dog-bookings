import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BookingActions } from "./BookingActions.jsx";
import { BOOKING_STATUS } from "../../../constants/salon";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

const baseProps = {
  editData: { slot: "10:00" },
  saving: false,
  booking: { id: "b1", status: BOOKING_STATUS.BOOKED },
  onSave: vi.fn(),
  onCancelEdit: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  currentDateStr: "2026-06-20",
  onClose: vi.fn(),
  onReschedule: vi.fn(),
};

describe("BookingActions", () => {
  it("#297 surfaces a 'Saved' autosave state in a live region while editing", () => {
    render(<BookingActions {...baseProps} isEditing autosaveStatus="saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("#297 surfaces an in-flight 'Saving' autosave state", () => {
    render(<BookingActions {...baseProps} isEditing autosaveStatus="saving" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
  });

  it("#297 keeps the autosave live region mounted (empty) when idle", () => {
    render(<BookingActions {...baseProps} isEditing autosaveStatus="idle" />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("#305 renders Delete as an explicit, accessibly-labelled destructive action", () => {
    render(<BookingActions {...baseProps} isEditing={false} />);
    expect(
      screen.getByRole("button", { name: /delete booking permanently/i }),
    ).toBeInTheDocument();
  });
  it("requires explicit attribution and a reason before cancelling", async () => {
    const onUpdate = vi.fn();
    render(<BookingActions {...baseProps} onUpdate={onUpdate} isEditing={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose who requested it and give a reason");
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it("retains the cancellation dialogue when the database write fails", async () => {
    render(<BookingActions {...baseProps} onUpdate={vi.fn().mockResolvedValue({success: false})} isEditing={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.change(screen.getByLabelText("Who requested the cancellation?"), {target: {value: "customer"}});
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {target: {value: "Cannot attend"}});
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t cancel this booking");
    expect(screen.getByRole("button", {name: "Keep booking"})).toBeInTheDocument();
  });

});
