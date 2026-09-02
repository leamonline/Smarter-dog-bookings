// Repository reads introduced when useWeeklyCashUp stopped using the
// Supabase client directly (Tier 1.1g).
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listCashUpDogs } from "./dogsRepo";
import { listCashUpHumans } from "./humansRepo";

function fakeQuery(result: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "abortSignal"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, calls };
}

describe("listCashUpDogs", () => {
  it("reads the price and name columns for every dog, with the signal", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });
    const signal = new AbortController().signal;

    await listCashUpDogs(client, signal);

    expect(from).toHaveBeenCalledWith("dogs");
    expect(calls).toEqual([
      { method: "select", args: ["id, name, breed, human_id, custom_price, size"] },
      { method: "abortSignal", args: [signal] },
    ]);
  });

  it("skips abortSignal when no signal is given", async () => {
    const { client, calls } = fakeQuery({ data: [], error: null });
    await listCashUpDogs(client);
    expect(calls.map((c) => c.method)).toEqual(["select"]);
  });
});

describe("listCashUpHumans", () => {
  it("reads the name and phone columns for every human, with the signal", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });
    const signal = new AbortController().signal;

    await listCashUpHumans(client, signal);

    expect(from).toHaveBeenCalledWith("humans");
    expect(calls).toEqual([
      { method: "select", args: ["id, name, surname, phone"] },
      { method: "abortSignal", args: [signal] },
    ]);
  });
});
