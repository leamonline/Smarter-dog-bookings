import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateCalendarFeedToken: vi.fn(),
  revokeCalendarFeedToken: vi.fn(),
}));

vi.mock("../customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../rpc", () => ({
  getOrCreateCalendarFeedToken: mocks.getOrCreateCalendarFeedToken,
  revokeCalendarFeedToken: mocks.revokeCalendarFeedToken,
}));

import { useCustomerCalendarFeed } from "./useCustomerCalendarFeed";

// A thenable that also carries abortSignal(), like the PostgREST builder.
function tokenQuery(result) {
  const q = {
    abortSignal: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe("useCustomerCalendarFeed", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    mocks.getOrCreateCalendarFeedToken
      .mockReset()
      .mockReturnValue(tokenQuery({ data: "tok-123", error: null }));
    mocks.revokeCalendarFeedToken
      .mockReset()
      .mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the single-event download URL with an encoded booking id and token", async () => {
    const { result } = renderHook(() => useCustomerCalendarFeed());

    const url = await result.current.getEventDownloadUrl("book/1");

    expect(mocks.getOrCreateCalendarFeedToken).toHaveBeenCalledWith(
      expect.anything(),
      "customer",
    );
    expect(url).toBe(
      "https://example.supabase.co/functions/v1/calendar-ics?booking_id=book%2F1&token=tok-123",
    );
  });

  it("builds the webcal:// subscribe URL and passes the abort signal through", async () => {
    const q = tokenQuery({ data: "tok-123", error: null });
    mocks.getOrCreateCalendarFeedToken.mockReturnValue(q);
    const controller = new AbortController();
    const { result } = renderHook(() => useCustomerCalendarFeed());

    const url = await result.current.getFeedSubscribeUrl(controller.signal);

    expect(q.abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(url).toBe(
      "webcal://example.supabase.co/functions/v1/calendar-feed?token=tok-123",
    );
  });

  it("returns null (not a URL) when the token RPC fails", async () => {
    mocks.getOrCreateCalendarFeedToken.mockReturnValue(
      tokenQuery({ data: null, error: { message: "nope" } }),
    );
    const { result } = renderHook(() => useCustomerCalendarFeed());

    expect(await result.current.getEventDownloadUrl("b1")).toBeNull();
    expect(await result.current.getFeedSubscribeUrl()).toBeNull();
  });

  it("returns null when the Supabase URL env is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    const { result } = renderHook(() => useCustomerCalendarFeed());

    expect(await result.current.getEventDownloadUrl("b1")).toBeNull();
  });

  it("revokes through the customer wrapper", async () => {
    const { result } = renderHook(() => useCustomerCalendarFeed());

    await result.current.revokeToken();

    expect(mocks.revokeCalendarFeedToken).toHaveBeenCalledWith(
      expect.anything(),
      "customer",
    );
  });
});
