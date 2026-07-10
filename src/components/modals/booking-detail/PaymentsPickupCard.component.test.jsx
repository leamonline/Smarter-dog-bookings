import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PaymentsPickupCard } from "./PaymentsPickupCard.jsx";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

const baseBooking = {
  id: "b1",
  service: "full-groom",
  size: "small",
  addons: [],
  payment: "Due at Pick-up",
  pickupBy: "Jess Barker",
  owner: "Jess Barker",
};

const duePricing = { subtotal: 55, amountDue: 55, isPaidInFull: false };

const baseEditData = {
  payment: "Due at Pick-up",
  paymentMethod: "card",
  paidAmount: null,
  depositAmount: 10,
  pickupBy: "Jess Barker",
};

describe("PaymentsPickupCard read mode — one-tap mark paid", () => {
  it("shows the amount due and records a card payment in one tap", async () => {
    const onUpdate = vi.fn().mockResolvedValue({ id: "b1" });
    render(
      <PaymentsPickupCard
        booking={baseBooking}
        isEditing={false}
        editData={baseEditData}
        setEditData={vi.fn()}
        humans={{}}
        primaryHuman={null}
        pricing={duePricing}
        onUpdate={onUpdate}
        currentDateStr="2026-07-10"
      />,
    );

    expect(screen.getByText("£55 due")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Card" }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [patched, fromDate, toDate] = onUpdate.mock.calls[0];
    // The full-value amount (custom price already resolved into pricing
    // upstream) travels with the method; paid_at is DB-trigger territory.
    expect(patched).toMatchObject({
      id: "b1",
      payment: "Paid in Full",
      paymentMethod: "card",
      paidAmount: 55,
    });
    expect(patched.paidAt).toBeUndefined();
    expect(fromDate).toBe("2026-07-10");
    expect(toDate).toBe("2026-07-10");
  });

  it("offers cash as a one-tap method too", async () => {
    const onUpdate = vi.fn().mockResolvedValue({ id: "b1" });
    render(
      <PaymentsPickupCard
        booking={baseBooking}
        isEditing={false}
        editData={baseEditData}
        setEditData={vi.fn()}
        humans={{}}
        primaryHuman={null}
        pricing={duePricing}
        onUpdate={onUpdate}
        currentDateStr="2026-07-10"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(onUpdate.mock.calls[0][0].paymentMethod).toBe("cash");
  });

  it("shows the settled amount + method (no buttons) once paid", () => {
    render(
      <PaymentsPickupCard
        booking={{
          ...baseBooking,
          payment: "Paid in Full",
          paymentMethod: "cash",
          paidAmount: 55,
        }}
        isEditing={false}
        editData={baseEditData}
        setEditData={vi.fn()}
        humans={{}}
        primaryHuman={null}
        pricing={{ subtotal: 55, amountDue: 0, isPaidInFull: true }}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-10"
      />,
    );

    expect(screen.getByText("£55 — Cash")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Card" })).not.toBeInTheDocument();
  });
});

describe("PaymentsPickupCard edit mode — method + amount capture", () => {
  it("prefills the amount from pricing when switching to Paid in Full", async () => {
    let editData = { ...baseEditData };
    const setEditData = vi.fn((updater) => {
      editData = typeof updater === "function" ? updater(editData) : updater;
    });
    render(
      <PaymentsPickupCard
        booking={baseBooking}
        isEditing={true}
        editData={editData}
        setEditData={setEditData}
        humans={{}}
        primaryHuman={null}
        pricing={duePricing}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-10"
      />,
    );

    await userEvent.selectOptions(
      screen.getByDisplayValue("Due at Pick-up"),
      "Paid in Full",
    );

    expect(editData.payment).toBe("Paid in Full");
    expect(editData.paidAmount).toBe(55);
  });

  it("shows method + amount fields once Paid in Full is selected, and keeps a staff override", async () => {
    let editData = { ...baseEditData, payment: "Paid in Full", paidAmount: 55 };
    const setEditData = vi.fn((updater) => {
      editData = typeof updater === "function" ? updater(editData) : updater;
    });
    render(
      <PaymentsPickupCard
        booking={baseBooking}
        isEditing={true}
        editData={editData}
        setEditData={setEditData}
        humans={{}}
        primaryHuman={null}
        pricing={duePricing}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-10"
      />,
    );

    // Method select present with the defaulted card option.
    const methodSelect = screen.getByDisplayValue("Card");
    await userEvent.selectOptions(methodSelect, "cash");
    expect(editData.paymentMethod).toBe("cash");

    // Amount is prefilled but editable (override allowed). fireEvent.change
    // rather than typing: the input is controlled by the harness variable,
    // so per-keystroke React value restoration would corrupt a typed value.
    const amountInput = screen.getByDisplayValue("55");
    fireEvent.change(amountInput, { target: { value: "50" } });
    expect(editData.paidAmount).toBe(50);
  });

  it("hides the ledger fields while payment is Due at Pick-up", () => {
    render(
      <PaymentsPickupCard
        booking={baseBooking}
        isEditing={true}
        editData={{ ...baseEditData }}
        setEditData={vi.fn()}
        humans={{}}
        primaryHuman={null}
        pricing={duePricing}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-10"
      />,
    );

    expect(screen.queryByText("Paid By")).not.toBeInTheDocument();
    expect(screen.queryByText("Amount Taken")).not.toBeInTheDocument();
  });
});
