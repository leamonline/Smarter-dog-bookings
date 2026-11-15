import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bucket = { createSignedUrl: vi.fn() };
  return { bucket, from: vi.fn(() => bucket) };
});

vi.mock("../client", () => ({
  supabase: { storage: { from: mocks.from } },
}));

import { useSignedMediaUrl } from "./useSignedMediaUrl";
import { logger } from "../../lib/logger";

// The cache is module-level and outlives each test, so every test signs its
// own paths.
const signed = (signedUrl) => ({ data: { signedUrl }, error: null });

beforeEach(() => {
  mocks.bucket.createSignedUrl.mockReset();
  mocks.from.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSignedMediaUrl", () => {
  it("reuses a signed URL that still has plenty of life left", async () => {
    const path = "conv-1/fresh.jpg";
    mocks.bucket.createSignedUrl.mockResolvedValueOnce(signed("https://signed.example/one"));
    const first = renderHook(() => useSignedMediaUrl(path));
    await waitFor(() => expect(first.result.current).toBe("https://signed.example/one"));
    first.unmount();

    vi.setSystemTime(new Date("2026-11-15T09:30:00Z"));
    const second = renderHook(() => useSignedMediaUrl(path));
    expect(second.result.current).toBe("https://signed.example/one");
    expect(mocks.from).toHaveBeenCalledWith("whatsapp-media");
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  // The staff app stays open all day on the salon devices. A thread reopened
  // after an hour must not be handed an expired link, which shows as a
  // broken image.
  it("signs again once the cached URL is about to expire", async () => {
    const path = "conv-1/stale.jpg";
    mocks.bucket.createSignedUrl
      .mockResolvedValueOnce(signed("https://signed.example/old"))
      .mockResolvedValueOnce(signed("https://signed.example/new"));
    const first = renderHook(() => useSignedMediaUrl(path));
    await waitFor(() => expect(first.result.current).toBe("https://signed.example/old"));
    first.unmount();

    vi.setSystemTime(new Date("2026-11-15T09:58:00Z"));
    const second = renderHook(() => useSignedMediaUrl(path));
    expect(second.result.current).toBeNull();
    await waitFor(() => expect(second.result.current).toBe("https://signed.example/new"));
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("signs again when it moves to a path whose cached URL is about to expire", async () => {
    mocks.bucket.createSignedUrl
      .mockResolvedValueOnce(signed("https://signed.example/b-old"))
      .mockResolvedValueOnce(signed("https://signed.example/a"))
      .mockResolvedValueOnce(signed("https://signed.example/b-new"));
    const early = renderHook(() => useSignedMediaUrl("conv-2/b.jpg"));
    await waitFor(() => expect(early.result.current).toBe("https://signed.example/b-old"));
    early.unmount();

    vi.setSystemTime(new Date("2026-11-15T09:58:00Z"));
    const { result, rerender } = renderHook(({ path }) => useSignedMediaUrl(path), {
      initialProps: { path: "conv-2/a.jpg" },
    });
    await waitFor(() => expect(result.current).toBe("https://signed.example/a"));

    rerender({ path: "conv-2/b.jpg" });
    await waitFor(() => expect(result.current).toBe("https://signed.example/b-new"));
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it("logs a thrown network error instead of leaving it unhandled", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mocks.bucket.createSignedUrl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useSignedMediaUrl("conv-3/offline.jpg"));
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "WhatsApp media signed URL failed",
        expect.objectContaining({ extra: expect.objectContaining({ error: new TypeError("Failed to fetch") }) }),
      ),
    );
    expect(result.current).toBeNull();
  });
});
