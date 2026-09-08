import { expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFunnelData } from "./useFunnelData";
import { useDenialsData } from "./useDenialsData";
const mocks = vi.hoisted(() => ({ from: vi.fn(), error: vi.fn() }));
vi.mock("../supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("../lib/logger", () => ({ logger: { error: mocks.error } }));
beforeEach(() => vi.clearAllMocks());

function source(response: () => Promise<unknown>) {
  const chain = { select: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(response) };
  for (const name of ["select", "gte", "lte", "order", "range"] as const) chain[name].mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  return chain;
}

it.each([useFunnelData, useDenialsData])("treats a rejected request as unavailable, not zero", async hook => {
  source(async () => { throw new Error("offline"); });
  const { result } = renderHook(() => hook(7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.available).toBe(false);
  expect(mocks.error).toHaveBeenCalled();
});

it.each([useFunnelData, useDenialsData])("accepts a counted empty source with bounded ordered reads", async hook => {
  const chain = source(async () => ({ data: [], count: 0, error: null }));
  const { result } = renderHook(() => hook(7));
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(chain.select.mock.calls[0][0]).not.toMatch(/human_id|reason_detail|failure_detail/);
  expect(chain.select.mock.calls[0][1]).toEqual({ count: "exact" });
  expect(chain.order).toHaveBeenCalledWith("id");
  expect(chain.lte).toHaveBeenCalledWith("created_at", expect.any(String));
});
