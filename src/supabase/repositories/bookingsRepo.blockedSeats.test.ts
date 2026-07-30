import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  getBlockedSeats: vi.fn(),
}));

vi.mock("../rpc", async (importOriginal) => ({
  ...await importOriginal<typeof import("../rpc")>(),
  getBlockedSeats: rpc.getBlockedSeats,
}));

import { listBlockedSeats } from "./bookingsRepo";

describe("listBlockedSeats", () => {
  beforeEach(() => {
    rpc.getBlockedSeats.mockReset();
  });

  it("returns a real error with the usable empty fallback when the RPC fails", async () => {
    rpc.getBlockedSeats.mockResolvedValue({
      data: null,
      error: { message: "response limit exceeded" },
    });

    const result = await listBlockedSeats({} as never, "2026-08-01", "2026-08-14");

    expect(result).toEqual({
      byDate: {},
      error: expect.objectContaining({ message: "response limit exceeded" }),
    });
  });

  it("folds blocked seats by date and slot and reports a complete read", async () => {
    rpc.getBlockedSeats.mockResolvedValue({
      data: [
        { setting_date: "2026-08-01", slot: "09:00", seat_index: 0 },
        { setting_date: "2026-08-01", slot: "09:00", seat_index: 1 },
        { setting_date: "2026-08-02", slot: "10:00", seat_index: 0 },
      ],
      error: null,
    });

    const result = await listBlockedSeats({} as never, "2026-08-01", "2026-08-02");

    expect(result).toEqual({
      byDate: {
        "2026-08-01": { "09:00": { 0: "blocked", 1: "blocked" } },
        "2026-08-02": { "10:00": { 0: "blocked" } },
      },
      error: null,
    });
  });
});
