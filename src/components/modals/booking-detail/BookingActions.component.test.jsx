import { render, screen } from "@testing-library/react";
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
});
