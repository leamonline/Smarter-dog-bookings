import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../client", () => ({ supabase: {} }));
vi.mock("../repositories/trustedContactsRepo", () => ({
  listCustomerAddedContacts: mocks.list,
  removeCustomerAddedContact: mocks.remove,
}));
vi.mock("../../lib/logger", () => ({ logger: { error: mocks.error, warn: vi.fn() } }));

import { useCustomerAddedContacts } from "./useCustomerAddedContacts";

const GRAN = { id: "cc-1", name: "Gran", surname: null, phone: "+447700900124", relationship: null, addedAt: null };

beforeEach(() => {
  mocks.list.mockReset();
  mocks.remove.mockReset();
  mocks.error.mockReset();
});

describe("useCustomerAddedContacts", () => {
  it("loads the owner's customer-added contacts", async () => {
    mocks.list.mockResolvedValue({ contacts: [GRAN], error: null });
    const { result } = renderHook(() => useCustomerAddedContacts("owner-1"));
    await waitFor(() => expect(result.current.contacts).toEqual([GRAN]));
    expect(result.current.status).toBe("loaded");
    expect(mocks.list).toHaveBeenCalledWith({}, "owner-1");
  });

  it("logs a thrown read and stays empty instead of rejecting unhandled", async () => {
    mocks.list.mockImplementation(() => { throw new TypeError("order is not a function"); });
    const { result } = renderHook(() => useCustomerAddedContacts("owner-1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(result.current.contacts).toEqual([]);
  });

  it("logs a returned read error and stays empty", async () => {
    mocks.list.mockResolvedValue({ contacts: [], error: new Error("permission denied") });
    const { result } = renderHook(() => useCustomerAddedContacts("owner-1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.contacts).toEqual([]);
  });

  it("starts as loading and a retry after a failure loads the list", async () => {
    mocks.list
      .mockResolvedValueOnce({ contacts: [], error: new Error("network") })
      .mockResolvedValueOnce({ contacts: [GRAN], error: null });
    const { result } = renderHook(() => useCustomerAddedContacts("owner-1"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.contacts).toEqual([GRAN]);
  });

  it("is honestly loaded and empty when there is no customer to look up", () => {
    const { result } = renderHook(() => useCustomerAddedContacts(null));
    expect(result.current.status).toBe("loaded");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("drops a contact only when a row was really removed", async () => {
    mocks.list.mockResolvedValue({ contacts: [GRAN], error: null });
    mocks.remove
      .mockResolvedValueOnce({ removed: false, error: null })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ removed: true, error: null });
    const { result } = renderHook(() => useCustomerAddedContacts("owner-1"));
    await waitFor(() => expect(result.current.contacts).toHaveLength(1));

    let outcome;
    await act(async () => { outcome = await result.current.remove("cc-1"); });
    expect(outcome).toBe(false);
    await act(async () => { outcome = await result.current.remove("cc-1"); });
    expect(outcome).toBe(false);
    expect(result.current.contacts).toHaveLength(1);
    await act(async () => { outcome = await result.current.remove("cc-1"); });
    expect(outcome).toBe(true);
    expect(result.current.contacts).toEqual([]);
  });
});
