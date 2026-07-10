import { describe, it, expect, vi } from "vitest";
import { addDaysStr, fetchUnpaidFortnightCount } from "./useUnpaidFortnight";

function stubClient(rows: unknown[], error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lt", "neq"]) builder[m] = vi.fn().mockReturnValue(builder);
  (builder as { abortSignal: unknown }).abortSignal = vi.fn().mockResolvedValue({ data: rows, error });
  return { from: vi.fn().mockReturnValue(builder), _builder: builder as Record<string, ReturnType<typeof vi.fn>> };
}

describe("addDaysStr", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysStr("2026-07-10", -14)).toBe("2026-06-26");
    expect(addDaysStr("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("is DST-immune (spring-forward window)", () => {
    expect(addDaysStr("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("fetchUnpaidFortnightCount", () => {
  it("counts with the canonical unpaid predicate (missing payment = due)", async () => {
    const client = stubClient([
      { payment: "Paid in Full" },
      { payment: "Due at Pick-up" },
      { payment: "Deposit Paid" },
      { payment: null },
    ]);
    const n = await fetchUnpaidFortnightCount(client as never, "2026-07-10", new AbortController().signal);
    expect(n).toBe(3);
    // Window: [today-14, today), cancelled excluded at the query.
    expect(client._builder.gte).toHaveBeenCalledWith("booking_date", "2026-06-26");
    expect(client._builder.lt).toHaveBeenCalledWith("booking_date", "2026-07-10");
    expect(client._builder.neq).toHaveBeenCalledWith("status", "Cancelled");
  });

  it("throws on query error", async () => {
    const client = stubClient([], { message: "boom" });
    await expect(fetchUnpaidFortnightCount(client as never, "2026-07-10", new AbortController().signal)).rejects.toThrow("boom");
  });
});
