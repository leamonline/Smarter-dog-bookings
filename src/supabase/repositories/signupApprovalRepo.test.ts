import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listPendingSignups, getSignupReview, saveSignupDogSize } from "./signupApprovalRepo";

const human = { id: "h1", name: "Alex", surname: "Taylor", phone: null, email: null, signup_submitted_at: "2026-09-04T10:00:00Z", dogs: [{ id: "d1", name: "Luna" }] };
const dog = { id: "d1", name: "Luna", breed: null, size: null, reportedSize: "small" };
function stub(results: unknown[]) {
  const calls: [string, ...unknown[]][] = [];
  const from = vi.fn((table: string) => {
    calls.push(["from", table]);
    const value = results.shift();
    const query: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => Promise.resolve(value).then(resolve) };
    for (const method of ["select", "is", "not", "eq", "order", "range", "maybeSingle", "update"]) {
      query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
    }
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}
describe("signup approval repository", () => {
  it("counts all pending signups while paging oldest first, independent of directory filters", async () => {
    const { client, calls } = stub([{ data: [human], count: 12, error: null }]);
    const result = await listPendingSignups(client, 1);
    expect(result).toMatchObject({ total: 12, customers: [{ name: "Alex Taylor", submittedAt: human.signup_submitted_at, dogs: [{ name: "Luna" }] }] });
    expect(calls).toEqual(expect.arrayContaining([
      ["is", "approved_at", null], ["not", "signup_submitted_at", "is", null],
      ["is", "archived_at", null], ["is", "dogs.archived_at", null],
      ["order", "signup_submitted_at", { ascending: true }], ["range", 5, 9],
    ]));
  });
  it("does not turn read failures or missing counts into an empty queue", async () => {
    for (const value of [{ error: {} }, { data: [], error: null, count: null }]) {
      await expect(listPendingSignups(stub([value]).client, 0)).rejects.toThrow("Couldn't load");
    }
  });
  it("loads beyond one dog page and never promotes reported size", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: `d${index}`, name: "Dog", breed: "Crossbreed", size: null, reported_size: "small" }));
    const { client, calls } = stub([{ data: human }, { data: rows }, { data: [{ ...rows[0], id: "last", size: "medium" }] }]);
    const result = await getSignupReview(client, "h1");
    expect(result.activeDogs).toHaveLength(101);
    expect(result.activeDogs[0]).toMatchObject({ size: null, reportedSize: "small" });
    expect(result.activeDogs[100].size).toBe("medium");
    expect(calls).toContainEqual(["range", 100, 199]);
  });
  it("rejects missing signups and incomplete dog reads", async () => {
    await expect(getSignupReview(stub([{ data: null }]).client, "h1")).rejects.toThrow("no longer");
    await expect(getSignupReview(stub([{ error: {} }]).client, "h1")).rejects.toThrow("Couldn't load");
    await expect(getSignupReview(stub([{ data: human }, { error: {} }]).client, "h1")).rejects.toThrow("all dogs");
  });
  it("guards staff size saves with owner, active state, previous size and breed", async () => {
    const { client, calls } = stub([{ data: { id: "d1" } }]);
    await saveSignupDogSize(client, "h1", dog, "small");
    expect(calls).toEqual(expect.arrayContaining([["update", { size: "small" }], ["eq", "human_id", "h1"], ["is", "archived_at", null], ["is", "size", null], ["is", "breed", null]]));
    const second = stub([{ data: { id: "d1" } }]);
    await saveSignupDogSize(second.client, "h1", { ...dog, breed: "Poodle", size: "medium" }, "large");
    expect(second.calls).toContainEqual(["eq", "size", "medium"]);
    expect(second.calls).toContainEqual(["eq", "breed", "Poodle"]);
  });
  it("fails on a stale row, denied write or invalid size", async () => {
    await expect(saveSignupDogSize(stub([{ data: null }]).client, "h1", dog, "small")).rejects.toThrow("details have changed");
    await expect(saveSignupDogSize(stub([{ error: {} }]).client, "h1", dog, "small")).rejects.toThrow("Couldn't save");
    await expect(saveSignupDogSize(stub([]).client, "h1", dog, "tiny" as never)).rejects.toThrow("valid dog size");
  });
});
