import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { PaymentHistoryPanel } from "./PaymentHistoryPanel.jsx";

const historyState = vi.hoisted(() => ({
  available: true,
  events: [],
  loading: false,
  error: null,
  refresh: vi.fn(async () => {}),
  restore: vi.fn(async () => 12),
}));

vi.mock("../../../supabase/hooks/useBookingPaymentHistory", () => ({
  useBookingPaymentHistory: () => historyState,
}));

const changedEvent = {
  id: 11,
  booking_id: "booking-1",
  operation: "UPDATE",
  before_values: {
    payment: "Deposit Paid",
    paid_amount: null,
    payment_method: null,
    paid_at: null,
    deposit_amount: 10,
    deposit_received_at: "2026-09-27T10:00:00Z",
  },
  after_values: {
    payment: "Paid in Full",
    paid_amount: 46,
    payment_method: "card",
    paid_at: "2026-09-27T12:00:00Z",
    deposit_amount: 10,
    deposit_received_at: "2026-09-27T10:00:00Z",
  },
  actor_id: "staff-1",
  actor_role: "authenticated",
  actorName: "Sam",
  recorded_at: "2026-09-27T12:00:00Z",
  restored_from: null,
  reason: null,
};

function renderPanel(onRestored = vi.fn(async () => {})) {
  render(
    <ToastProvider>
      <PaymentHistoryPanel bookingId="booking-1" onRestored={onRestored} />
    </ToastProvider>,
  );
  return onRestored;
}

describe("PaymentHistoryPanel", () => {
  beforeEach(() => {
    historyState.available = true;
    historyState.events = [changedEvent];
    historyState.loading = false;
    historyState.error = null;
    historyState.refresh.mockClear();
    historyState.restore.mockReset().mockResolvedValue(12);
  });

  it("reveals the saved change, actor and before/after values on demand", () => {
    renderPanel();
    expect(screen.queryByText("Payment changed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Payment history" }));

    expect(screen.getByText("Payment changed")).toBeInTheDocument();
    expect(screen.getByText(/Sam/)).toBeInTheDocument();
    expect(screen.getByText("Paid in Full")).toBeInTheDocument();
    expect(screen.getByText("£46")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("requires a reason and restores against the latest event before refreshing", async () => {
    const onRestored = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Payment history" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    const submit = screen.getByRole("button", { name: "Restore payment details" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Amount entered incorrectly" },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(historyState.restore).toHaveBeenCalledWith(11, 11, "Amount entered incorrectly");
      expect(historyState.refresh).toHaveBeenCalledTimes(1);
      expect(onRestored).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Payment details restored and recorded")).toBeInTheDocument();
  });

  it("keeps a stale-change failure visible for review", async () => {
    historyState.restore.mockRejectedValueOnce(new Error("The payment record changed. Reload the history and review it before trying again."));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Payment history" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.change(screen.getByLabelText("Correction reason"), { target: { value: "Wrong method" } });
    fireEvent.click(screen.getByRole("button", { name: "Restore payment details" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Reload the history and review it");
    expect(historyState.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload and review history" }));
    await waitFor(() => expect(historyState.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Correction reason")).not.toBeInTheDocument();
  });
});
