import { useState } from "react";
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

function renderEditingSection({ booking = baseBooking, pricing, editData, setEditData = vi.fn() }) {
  return render(
    <ToastProvider>
      <PaymentStateSection
        booking={booking}
        pricing={pricing}
        isEditing
        editData={editData}
        setEditData={setEditData}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-13"
      />
    </ToastProvider>,
  );
}

function EditablePaymentHarness({ pricing }) {
  const [editData, setEditData] = useState({
    payment: "Deposit Paid",
    paymentMethod: "card",
    paidAmount: null,
    depositAmount: 10,
  });
  return (
    <ToastProvider>
      <PaymentStateSection
        booking={{ ...baseBooking, payment: "Deposit Paid", depositAmount: 10 }}
        pricing={pricing}
        isEditing
        editData={editData}
        setEditData={setEditData}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-13"
      />
    </ToastProvider>
  );
}

describe("PaymentStateSection", () => {
  it("shows a single due summary with accessible one-tap methods", () => {
    renderSection({
      booking: { ...baseBooking, status: "Ready for collection", payment: "Due at Pick-up" },
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

  it("does not present a non-positive deposit as money paid", () => {
    renderSection({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: -5 },
      pricing: { subtotal: 46, depositPaid: -5, amountDue: 51, isDepositPaid: true },
    });

    expect(screen.getByText("£46 to pay")).toBeInTheDocument();
    expect(screen.queryByText(/-?£5 paid/)).not.toBeInTheDocument();
  });

  it("shows no balance or collection controls when the deposit exactly covers the total", () => {
    renderSection({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 46 },
      pricing: { subtotal: 46, depositPaid: 46, amountDue: 0, isDepositPaid: true },
    });

    expect(screen.getByText("£46 deposit paid · no balance to collect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record £/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Record £0")).not.toBeInTheDocument();
  });

  it("shows no balance or collection controls when the deposit exceeds the total", () => {
    renderSection({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 50 },
      pricing: { subtotal: 46, depositPaid: 50, amountDue: 0, isDepositPaid: true },
    });

    expect(screen.getByText("£50 deposit paid · no balance to collect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record £/i })).not.toBeInTheDocument();
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

  it("falls back to the positive subtotal when a settled booking stores paidAmount zero", () => {
    renderSection({
      booking: {
        ...baseBooking,
        payment: "Paid in Full",
        paymentMethod: "card",
        paidAmount: 0,
      },
      pricing: { subtotal: 46, amountDue: 0, isPaidInFull: true },
    });

    expect(screen.getByText("Paid £46 · Card")).toBeInTheDocument();
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

  it("shows an error and re-enables every payment method when recording rejects", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("save failed"));
    renderSection({
      booking: { ...baseBooking, payment: "Due at Pick-up" },
      pricing: { subtotal: 46, amountDue: 46 },
      onUpdate,
    });

    fireEvent.click(screen.getByRole("button", { name: "Record £46 card payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't record payment — try again");
    expect(screen.queryByText("Payment recorded")).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /Record £46 .* payment/ })) {
      expect(button).toBeEnabled();
    }
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

  it("gives every edit-mode payment control an accessible name and touch-safe focus styling", () => {
    renderEditingSection({
      booking: { ...baseBooking, payment: "Paid in Full" },
      pricing: { subtotal: 46, amountDue: 0 },
      editData: {
        payment: "Paid in Full",
        paymentMethod: "card",
        paidAmount: 46,
        depositAmount: 10,
      },
    });

    for (const name of ["Payment status", "Paid by", "Amount taken"]) {
      const control = screen.getByRole(name === "Amount taken" ? "spinbutton" : "combobox", { name });
      expect(control).toHaveClass("min-h-11");
      expect(control.className).toContain("focus-visible:ring");
    }
  });

  it("names and constrains the deposit amount control below the booking total", () => {
    renderEditingSection({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 10 },
      pricing: { subtotal: 46, amountDue: 36 },
      editData: {
        payment: "Deposit Paid",
        paymentMethod: "card",
        paidAmount: null,
        depositAmount: 10,
      },
    });

    const control = screen.getByRole("spinbutton", { name: "Deposit amount" });
    expect(control).toHaveAttribute("max", "45.99");
    expect(control).toHaveClass("min-h-11");
    expect(control.className).toContain("focus-visible:ring");
  });

  it("keeps an exact-total deposit as entered and surfaces shared validation", () => {
    render(<EditablePaymentHarness pricing={{ subtotal: 46, amountDue: 36 }} />);

    const control = screen.getByRole("spinbutton", { name: "Deposit amount" });
    fireEvent.change(control, { target: { value: "46" } });

    expect(control).toHaveValue(46);
    expect(control).not.toHaveValue(45.99);
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Deposit must be less than the booking total")).toBeInTheDocument();
  });
});
