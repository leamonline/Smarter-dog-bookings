import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateCalendarFeedToken: vi.fn(),
  revokeCalendarFeedToken: vi.fn(),
}));

vi.mock("../client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("../rpc", () => ({
  getOrCreateCalendarFeedToken: mocks.getOrCreateCalendarFeedToken,
  revokeCalendarFeedToken: mocks.revokeCalendarFeedToken,
}));

import { useStaffCalendarFeed } from "./useStaffCalendarFeed";

function tokenQuery(result) {
  const q = {
    abortSignal: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe("useStaffCalendarFeed", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    mocks.getOrCreateCalendarFeedToken
      .mockReset()
      .mockReturnValue(tokenQuery({ data: "tok-staff", error: null }));
    mocks.revokeCalendarFeedToken
      .mockReset()
      .mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the staff webcal:// subscribe URL from the staff feed token", async () => {
    const { result } = renderHook(() => useStaffCalendarFeed());

    const url = await result.current.getFeedSubscribeUrl();

    expect(mocks.getOrCreateCalendarFeedToken).toHaveBeenCalledWith(
      expect.anything(),
      "staff",
    );
    expect(url).toBe(
      "webcal://example.supabase.co/functions/v1/calendar-feed?token=tok-staff",
    );
  });

  it("returns null when the token RPC fails", async () => {
    mocks.getOrCreateCalendarFeedToken.mockReturnValue(
      tokenQuery({ data: null, error: { message: "nope" } }),
    );
    const { result } = renderHook(() => useStaffCalendarFeed());

    expect(await result.current.getFeedSubscribeUrl()).toBeNull();
  });

  it("revokes through the staff wrapper", async () => {
    const { result } = renderHook(() => useStaffCalendarFeed());

    await result.current.revokeToken();

    expect(mocks.revokeCalendarFeedToken).toHaveBeenCalledWith(
      expect.anything(),
      "staff",
    );
  });
});
