import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS, keepingNullStatusOr } from "../../constants/salon";
import type { Database } from "../database.types";
import { selectTomorrowReminderBookings } from "./useTomorrowReminders";

type Call = { method: string; args: unknown[] };

function fakeQuery() {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "not", "order"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

const argsOf = (calls: Call[], method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

describe("selectTomorrowReminderBookings", () => {
  it("keeps a NULL status and still excludes Cancelled and Completed", () => {
    const { client, calls } = fakeQuery();

    selectTomorrowReminderBookings(client, "2026-11-04");

    expect(argsOf(calls, "eq")).toEqual([["booking_date", "2026-11-04"]]);
    expect(keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED])).toBe(
      'status.is.null,status.not.in.("Cancelled","Completed")',
    );
    expect(argsOf(calls, "or")).toEqual([
      [keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED])],
    ]);
    expect(argsOf(calls, "not")).toEqual([]);
    expect(argsOf(calls, "order")).toEqual([["slot", { ascending: true }]]);
  });
});
