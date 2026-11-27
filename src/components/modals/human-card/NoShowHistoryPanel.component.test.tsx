import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NoShowHistoryPanel } from "./NoShowHistoryPanel";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../supabase/client", () => ({ supabase: {} }));
vi.mock("../../../supabase/repositories/noShowHistoryRepo", () => ({ getNoShowHistory: mocks.get }));
const sameDay = { bookingDate: "2026-12-01", slot: "09:30:00", dogNames: ["Biscuit", "Moose"], customerCancelled: true, reason: "Car broke down" };
const marked = { bookingDate: "2026-11-30", slot: "08:30", dogNames: ["Biscuit"], customerCancelled: false, reason: "No-show" };
beforeEach(() => { vi.clearAllMocks(); });
describe("No-show history", () => {
  it("shows the count against the database's threshold and who caused each", async () => {
    mocks.get.mockResolvedValue({ count: 2, threshold: 2, since: "2026-11-24", items: [sameDay, marked] });
    render(<NoShowHistoryPanel humanId="customer" />);
    expect(await screen.findByText("2 of 2 in the last 12 months")).toBeInTheDocument();
    expect(screen.getByText(/Deposit required: 2 or more no-shows/)).toBeInTheDocument();
    expect(screen.getByText(/Counted from Tuesday 24 November 2026/)).toBeInTheDocument();
    expect(screen.getByText("Tuesday 1 December 2026 at 09:30 · Biscuit, Moose")).toBeInTheDocument();
    expect(screen.getByText("Customer cancelled on the day: Car broke down")).toBeInTheDocument();
    expect(screen.getByText("Marked as a no-show by staff")).toBeInTheDocument();
  });
  it("does not warn below the threshold", async () => {
    mocks.get.mockResolvedValue({ count: 1, threshold: 2, since: "2026-11-24", items: [marked] });
    render(<NoShowHistoryPanel humanId="customer" />);
    expect(await screen.findByText("1 of 2 in the last 12 months")).toBeInTheDocument();
    expect(screen.queryByText(/Deposit required:/)).toBeNull();
  });
  it("does not represent an unreadable history as zero, and can retry", async () => {
    mocks.get.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue({ count: 0, threshold: 2, since: null, items: [] });
    render(<NoShowHistoryPanel humanId="customer" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn’t load no-shows/);
    expect(screen.queryByText(/0 of 2/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No no-shows recorded.")).toBeInTheDocument();
  });
});
