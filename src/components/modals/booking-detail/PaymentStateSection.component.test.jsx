import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { PaymentStateSection } from "./PaymentStateSection.jsx";

const baseBooking = {
  id: "b1",
  service: "full-groom",
  size: "medium",
  addons: [],
  owner: "Tom Clark",
};

function renderSection({ booking, pricing, onUpdate = vi.fn() }) {
  return render(
    <ToastProvider>
      <PaymentStateSection
        booking={booking}
        pricing={pricing}
        isEditing={false}
        editData={{
          payment: booking.payment,
          paymentMethod: "card",
          paidAmount: null,
          depositAmount: booking.depositAmount ?? 0,
        }}
        setEditData={vi.fn()}
        onUpdate={onUpdate}
        currentDateStr="2026-07-13"
      />
    </ToastProvider>,
  );
}

describe("PaymentStateSection", () => {
  it("shows a single due summary with accessible one-tap methods", () => {
    renderSection({
      booking: { ...baseBooking, status: "Ready for pick-up", payment: "Due at Pick-up" },
      pricing: { subtotal: 46, amountDue: 46 },
    });

    expect(screen.getByText("£46 to pay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record £46 cash payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record £46 card payment" })).toBeInTheDocument();
    expect(screen.getByTestId("payment-state")).toHaveAttribute("data-priority", "high");
  });

  it("shows deposit arithmetic without a negative line", () => {
    renderSection({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 10 },
      pricing: { subtotal: 46, depositPaid: 10, amountDue: 36, isDepositPaid: true },
    });

    expect(screen.getByText("£10 paid · £36 to pay")).toBeInTheDocument();
    expect(screen.queryByText(/−£/)).not.toBeInTheDocument();
  });

  it("shows a compact paid confirmation without payment buttons", () => {
    renderSection({
      booking: {
        ...baseBooking,
        payment: "Paid in Full",
        paymentMethod: "card",
        paidAmount: 46,
      },
      pricing: { subtotal: 46, amountDue: 0, isPaidInFull: true },
    });

    expect(screen.getByText("Paid £46 · Card")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record £/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Paid £0")).not.toBeInTheDocument();
  });

  it("keeps every payment method enabled when recording fails", async () => {
    const onUpdate = vi.fn().mockResolvedValue(null);
    renderSection({
      booking: { ...baseBooking, payment: "Due at Pick-up" },
      pricing: { subtotal: 46, amountDue: 46 },
      onUpdate,
    });

    fireEvent.click(screen.getByRole("button", { name: "Record £46 card payment" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText("£46 to pay")).toBeInTheDocument();
      for (const button of screen.getAllByRole("button", { name: /Record £46 .* payment/ })) {
        expect(button).toBeEnabled();
      }
    });
  });

  it("records the full subtotal after collecting a deposit balance", async () => {
    const onUpdate = vi.fn().mockResolvedValue({ id: "b1" });
    const booking = { ...baseBooking, payment: "Deposit Paid", depositAmount: 10 };
    renderSection({
      booking,
      pricing: { subtotal: 46, depositPaid: 10, amountDue: 36, isDepositPaid: true },
      onUpdate,
    });

    fireEvent.click(screen.getByRole("button", { name: "Record £36 card payment" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ payment: "Paid in Full", paymentMethod: "card", paidAmount: 46 }),
      "2026-07-13",
      "2026-07-13",
    );
  });
});
