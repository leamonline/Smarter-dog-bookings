import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CancellationHistoryPanel } from "./CancellationHistoryPanel";
const mocks = vi.hoisted(() => ({ get: vi.fn(), waive: vi.fn() }));
vi.mock("../../../supabase/client", () => ({ supabase: {} }));
vi.mock("../../../supabase/repositories/cancellationHistoryRepo", () => ({ getCancellationHistory: mocks.get, waiveCancellation: mocks.waive }));
const item = { id: "incident", bookingDate: "2026-10-01", requestedAt: "2026-10-01T10:00:00Z", reason: "Customer cannot attend", actorScope: "customer", waivedAt: null, waiverReason: null };
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ count: 3, reviewRequired: true, items: [item] }); mocks.waive.mockResolvedValue(undefined); });
describe("Cancellation history", () => {
  it("shows server threshold and keeps deposit choice with staff", async () => {
    render(<CancellationHistoryPanel humanId="customer" />);
    expect(await screen.findByText("3 in the last 12 months")).toBeInTheDocument();
    expect(screen.getByText(/Review deposits:/)).toBeInTheDocument();
    expect(screen.getByText(/Deposits remain a staff decision/)).toBeInTheDocument();
    expect(screen.getByText("Customer cannot attend")).toBeInTheDocument();
    expect(mocks.waive).not.toHaveBeenCalled();
  });
  it("does not represent an unreadable history as zero", async () => {
    mocks.get.mockRejectedValue(new Error("Unavailable"));
    render(<CancellationHistoryPanel humanId="customer" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn’t load/);
    expect(screen.queryByText("0 in the last 12 months")).toBeNull();
  });
  it("requires a waiver reason and refreshes after the server commit", async () => {
    render(<CancellationHistoryPanel humanId="customer" />);
    fireEvent.click(await screen.findByRole("button", { name: "Waive this record" }));
    expect(screen.getByRole("button", { name: "Save waiver" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for waiver"), { target: { value: "Exceptional circumstances" } });
    fireEvent.click(screen.getByRole("button", { name: "Save waiver" }));
    await waitFor(() => expect(mocks.waive).toHaveBeenCalledWith("incident", "Exceptional circumstances"));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });
});
