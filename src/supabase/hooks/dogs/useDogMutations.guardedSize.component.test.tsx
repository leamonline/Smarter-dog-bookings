import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// A chainable fake of the dogs update query that records each filter.
const calls: Array<[string, ...unknown[]]> = [];
let result: { data: unknown; error: unknown } = { data: null, error: null };
function chain() {
  const q: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ["update", "eq", "is", "select"]) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return q;
    };
  }
  q.single = () => Promise.resolve(result);
  q.maybeSingle = () => Promise.resolve(result);
  return q;
}
vi.mock("../../client", () => ({ supabase: { from: () => chain() } }));

import { useDogMutations } from "./useDogMutations";

const row = {
  id: "dog-1", name: "Bramble", breed: "Pug x Labrador", age: "", dob: "", size: null,
  reported_size: "medium", human_id: "h-1", alerts: [], groom_notes: "", custom_price: null,
};

function setup() {
  let dogsById: Record<string, unknown> = { "dog-1": row };
  const setDogsById = vi.fn((next: unknown) => {
    dogsById = typeof next === "function" ? (next as (p: typeof dogsById) => typeof dogsById)(dogsById) : (next as typeof dogsById);
  });
  const { result: hook } = renderHook(() =>
    useDogMutations({
      dogs: { "dog-1": { id: "dog-1", name: "Bramble", size: null } } as never,
      dogsById: dogsById as never,
      humansById: {} as never,
      setDogsById: setDogsById as never,
      setError: vi.fn(),
      setTotalCount: vi.fn(),
      invalidateHuman: vi.fn(),
    }),
  );
  return { hook, getDogsById: () => dogsById };
}

describe("updateDog guarded size confirmation", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("only writes while the dog is still unsized with the estimate staff saw", async () => {
    result = { data: { ...row, size: "medium" }, error: null };
    const { hook } = setup();

    let saved: unknown;
    await act(async () => {
      saved = await hook.current.updateDog("dog-1", { size: "medium" }, { onlyIfUnsizedWithReported: "medium" });
    });

    expect(calls).toContainEqual(["is", "size", null]);
    expect(calls).toContainEqual(["eq", "reported_size", "medium"]);
    expect(saved).toMatchObject({ id: "dog-1", size: "medium" });
  });

  it("returns null and restores the cache when the dog changed meanwhile", async () => {
    result = { data: null, error: null };
    const { hook, getDogsById } = setup();

    let saved: unknown = "untouched";
    await act(async () => {
      saved = await hook.current.updateDog("dog-1", { size: "medium" }, { onlyIfUnsizedWithReported: "medium" });
    });

    expect(saved).toBeNull();
    expect(getDogsById()["dog-1"]).toEqual(row);
  });

  it("leaves ordinary edits unguarded", async () => {
    result = { data: { ...row, name: "Bramble Rose" }, error: null };
    const { hook } = setup();

    await act(async () => {
      await hook.current.updateDog("dog-1", { name: "Bramble Rose" });
    });

    expect(calls.some(([m]) => m === "is")).toBe(false);
  });
});
