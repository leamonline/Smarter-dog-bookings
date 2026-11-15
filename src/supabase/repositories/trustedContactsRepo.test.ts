import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listCustomerAddedContacts, removeCustomerAddedContact } from "./trustedContactsRepo";

// A chainable PostgREST stand-in that records each call and resolves to `result`.
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "delete"]) q[m] = vi.fn(() => q);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const from = vi.fn(() => q);
  return { client: { from } as unknown as SupabaseClient, from, q };
}

describe("listCustomerAddedContacts", () => {
  it("reads one owner's contacts, oldest first, app-shaped", async () => {
    const { client, from, q } = fakeClient({
      data: [{ id: "cc-1", name: "Gran", surname: null, phone: "+447700900124", relationship: "Mum", created_at: "2026-11-15T01:00:00Z" }],
      error: null,
    });
    const { contacts, error } = await listCustomerAddedContacts(client, "owner-1");
    expect(error).toBeNull();
    expect(from).toHaveBeenCalledWith("customer_trusted_contacts");
    expect(q.eq).toHaveBeenCalledWith("owner_human_id", "owner-1");
    expect(q.order).toHaveBeenCalledWith("created_at");
    expect(contacts).toEqual([
      { id: "cc-1", name: "Gran", surname: null, phone: "+447700900124", relationship: "Mum", addedAt: "2026-11-15T01:00:00Z" },
    ]);
  });

  it("returns the error and no contacts when the read fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied" } });
    const { contacts, error } = await listCustomerAddedContacts(client, "owner-1");
    expect(contacts).toEqual([]);
    expect(error?.message).toBe("permission denied");
  });
});

describe("removeCustomerAddedContact", () => {
  it("deletes by id and reports a removal only when a row came back", async () => {
    const removedRow = fakeClient({ data: [{ id: "cc-1" }], error: null });
    expect(await removeCustomerAddedContact(removedRow.client, "cc-1")).toEqual({ removed: true, error: null });
    expect(removedRow.q.delete).toHaveBeenCalled();
    expect(removedRow.q.eq).toHaveBeenCalledWith("id", "cc-1");

    // RLS hides the row from a non-staff caller: no error, but nothing removed.
    const nothing = fakeClient({ data: [], error: null });
    expect(await removeCustomerAddedContact(nothing.client, "cc-1")).toEqual({ removed: false, error: null });
  });

  it("returns the error when the delete fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "network" } });
    const { removed, error } = await removeCustomerAddedContact(client, "cc-1");
    expect(removed).toBe(false);
    expect(error?.message).toBe("network");
  });
});
