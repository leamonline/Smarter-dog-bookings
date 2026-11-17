import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bucket = { createSignedUrl: vi.fn() };
  return { bucket, from: vi.fn(() => bucket) };
});

// The staff client, not the customer one: staff read every dog's photo
// through staff_read_dog_photos (20261115120000).
vi.mock("../client", () => ({ supabase: { storage: { from: mocks.from } } }));
vi.mock("../customerClient", () => ({
  customerSupabase: { storage: { from: () => { throw new Error("customer client used by the staff app"); } } },
}));

import { useStaffDogPhotoUrl } from "./useStaffDogPhoto";

const DOG = "26400000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.from.mockClear();
  mocks.bucket.createSignedUrl.mockReset();
});

describe("useStaffDogPhotoUrl", () => {
  it("signs the photo with the staff client in the dog-photos bucket", async () => {
    mocks.bucket.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://signed.example/staff" }, error: null });
    const { result } = renderHook(() => useStaffDogPhotoUrl(`${DOG}/a.jpg`));
    await waitFor(() => expect(result.current.url).toBe("https://signed.example/staff"));
    expect(mocks.from).toHaveBeenCalledWith("dog-photos");
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledWith(`${DOG}/a.jpg`, 3600);
  });

  it("has no link while signing fails, so the card shows the initial", async () => {
    mocks.bucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "Object not found" } });
    const { result } = renderHook(() => useStaffDogPhotoUrl(`${DOG}/gone.jpg`));
    await waitFor(() => expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(1));
    expect(result.current.url).toBeNull();
  });

  it("signs nothing for a dog without a photo", () => {
    const { result } = renderHook(() => useStaffDogPhotoUrl(null));
    expect(result.current.url).toBeNull();
    expect(mocks.bucket.createSignedUrl).not.toHaveBeenCalled();
  });
});
