import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bucket = { upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() };
  return {
    bucket,
    from: vi.fn(() => bucket),
    setCustomerDogPhoto: vi.fn(),
    prepareDogPhoto: vi.fn(),
    getDogPhotoPath: vi.fn(),
  };
});

vi.mock("../customerClient", () => ({
  customerSupabase: { storage: { from: mocks.from } },
}));
vi.mock("../rpc", () => ({ setCustomerDogPhoto: mocks.setCustomerDogPhoto }));
vi.mock("../../lib/dogPhoto", () => ({ prepareDogPhoto: mocks.prepareDogPhoto }));
vi.mock("../repositories/dogsRepo", () => ({ getDogPhotoPath: mocks.getDogPhotoPath }));

import { useCustomerDogPhoto, useDogPhotoUrl } from "./useCustomerDogPhoto";

const DOG = "26300000-0000-4000-8000-000000000001";
const FILE = new File(["x"], "tipi.jpg", { type: "image/jpeg" });
// The exact shape set_customer_dog_photo accepts (20261115120000). Anything
// else is uploaded, refused by the database and deleted again.
const SERVER_PATH = new RegExp(
  `^${DOG}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|webp)$`,
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.bucket.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.bucket.remove.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.setCustomerDogPhoto.mockReset().mockResolvedValue({ data: [{ previous_photo_path: null }], error: null });
  mocks.prepareDogPhoto.mockReset().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  mocks.getDogPhotoPath.mockReset().mockResolvedValue({ photoPath: null, error: null });
  mocks.from.mockClear();
});

describe("useCustomerDogPhoto", () => {
  it("uploads the prepared photo under a new name in the dog's folder, then points the dog at it", async () => {
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(error).toBeNull();
    expect(photoPath).toMatch(SERVER_PATH);
    expect(mocks.from).toHaveBeenCalledWith("dog-photos");
    const [path, blob, options] = mocks.bucket.upload.mock.calls[0];
    expect(path).toBe(photoPath);
    expect(blob.type).toBe("image/jpeg");
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(mocks.setCustomerDogPhoto).toHaveBeenCalledWith(expect.anything(), { dogId: DOG, photoPath });
    expect(mocks.bucket.remove).not.toHaveBeenCalled();
  });

  // iOS before 15.4 and other older browsers have no crypto.randomUUID.
  it("names the upload in the shape the database accepts when crypto.randomUUID is missing", async () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (bytes) => real.getRandomValues(bytes) });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(photoPath).toMatch(SERVER_PATH);
    expect(mocks.bucket.upload.mock.calls[0][0]).toMatch(SERVER_PATH);
  });

  it("names the upload in the shape the database accepts with no Web Crypto at all", async () => {
    vi.stubGlobal("crypto", undefined);
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(photoPath).toMatch(SERVER_PATH);
  });

  it("deletes the previous photo once the dog points at the new one", async () => {
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: [{ previous_photo_path: `${DOG}/old.jpg` }], error: null });
    const { result } = renderHook(() => useCustomerDogPhoto());
    await result.current.uploadDogPhoto(DOG, FILE);
    expect(mocks.bucket.remove).toHaveBeenCalledWith([`${DOG}/old.jpg`]);
  });

  it("deletes its own upload again when the database refuses it", async () => {
    const refusal = { code: "22023", message: "photo_not_uploaded" };
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: null, error: refusal });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(photoPath).toBeNull();
    expect(error).toEqual(refusal);
    // A refusal the database sent is certain: no read-back needed.
    expect(mocks.getDogPhotoPath).not.toHaveBeenCalled();
    const uploaded = mocks.bucket.upload.mock.calls[0][0];
    expect(mocks.bucket.remove).toHaveBeenCalledWith([uploaded]);
  });

  it("uploads nothing when the photo cannot be prepared", async () => {
    mocks.prepareDogPhoto.mockRejectedValue(new Error("unreadable"));
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(error).toEqual(new Error("unreadable"));
    expect(mocks.bucket.upload).not.toHaveBeenCalled();
    expect(mocks.setCustomerDogPhoto).not.toHaveBeenCalled();
  });

  it("stops before the database when the upload fails", async () => {
    mocks.bucket.upload.mockResolvedValue({ data: null, error: { message: "too big" } });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(error).toEqual({ message: "too big" });
    expect(mocks.setCustomerDogPhoto).not.toHaveBeenCalled();
  });

  // A dropped connection can lose the reply to a save that committed. The
  // upload must not be deleted until the dog is known not to point at it.
  describe("when the save's outcome is unknown", () => {
    it("treats it as saved when the dog already points at the upload", async () => {
      mocks.setCustomerDogPhoto.mockRejectedValue(new TypeError("Failed to fetch"));
      mocks.getDogPhotoPath.mockImplementation(async () => ({
        photoPath: mocks.bucket.upload.mock.calls[0][0],
        error: null,
      }));
      const { result } = renderHook(() => useCustomerDogPhoto());
      const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
      expect(error).toBeNull();
      expect(photoPath).toBe(mocks.bucket.upload.mock.calls[0][0]);
      expect(mocks.getDogPhotoPath).toHaveBeenCalledWith(expect.anything(), DOG);
      expect(mocks.bucket.remove).not.toHaveBeenCalled();
    });

    it("deletes the upload when the dog does not point at it", async () => {
      // supabase-js reports a fetch failure as a code-less error object.
      mocks.setCustomerDogPhoto.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } });
      mocks.getDogPhotoPath.mockResolvedValue({ photoPath: `${DOG}/older.jpg`, error: null });
      const { result } = renderHook(() => useCustomerDogPhoto());
      const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
      expect(photoPath).toBeNull();
      expect(error).toEqual({ message: "TypeError: Failed to fetch", code: "" });
      expect(mocks.bucket.remove).toHaveBeenCalledWith([mocks.bucket.upload.mock.calls[0][0]]);
    });

    it("keeps the upload when the read-back fails too", async () => {
      mocks.setCustomerDogPhoto.mockRejectedValue(new TypeError("Failed to fetch"));
      mocks.getDogPhotoPath.mockResolvedValue({ photoPath: null, error: new Error("offline") });
      const { result } = renderHook(() => useCustomerDogPhoto());
      const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
      expect(photoPath).toBeNull();
      expect(error).toEqual(new TypeError("Failed to fetch"));
      expect(mocks.bucket.remove).not.toHaveBeenCalled();
    });

    it("keeps the upload when the read-back throws", async () => {
      mocks.setCustomerDogPhoto.mockRejectedValue(new TypeError("Failed to fetch"));
      mocks.getDogPhotoPath.mockRejectedValue(new TypeError("Failed to fetch"));
      const { result } = renderHook(() => useCustomerDogPhoto());
      const { error } = await result.current.uploadDogPhoto(DOG, FILE);
      expect(error).toEqual(new TypeError("Failed to fetch"));
      expect(mocks.bucket.remove).not.toHaveBeenCalled();
    });
  });

  it("returns an error rather than throwing when the upload itself throws", async () => {
    mocks.bucket.upload.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(error).toEqual(new TypeError("Failed to fetch"));
    expect(mocks.setCustomerDogPhoto).not.toHaveBeenCalled();
    expect(mocks.bucket.remove).not.toHaveBeenCalled();
  });

  it("removing clears the dog first, then deletes the old file", async () => {
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: [{ previous_photo_path: `${DOG}/old.jpg` }], error: null });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { error } = await result.current.removeDogPhoto(DOG);
    expect(error).toBeNull();
    expect(mocks.setCustomerDogPhoto).toHaveBeenCalledWith(expect.anything(), { dogId: DOG, photoPath: null });
    expect(mocks.bucket.remove).toHaveBeenCalledWith([`${DOG}/old.jpg`]);
  });
});

describe("useDogPhotoUrl", () => {
  const signed = (signedUrl) => ({ data: { signedUrl }, error: null });

  beforeEach(() => {
    mocks.bucket.createSignedUrl.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T09:00:00Z"));
  });

  it("reuses a signed URL that still has plenty of life left", async () => {
    const path = `${DOG}/fresh.jpg`;
    mocks.bucket.createSignedUrl.mockResolvedValueOnce(signed("https://signed.example/one"));
    const first = renderHook(() => useDogPhotoUrl(path));
    await waitFor(() => expect(first.result.current).toBe("https://signed.example/one"));
    first.unmount();

    vi.setSystemTime(new Date("2026-11-15T09:30:00Z"));
    const second = renderHook(() => useDogPhotoUrl(path));
    expect(second.result.current).toBe("https://signed.example/one");
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  // The portal stays open for hours as a home-screen app; a cached URL that
  // has expired would show an empty avatar instead of the dog's initial.
  it("signs again once the cached URL is about to expire", async () => {
    const path = `${DOG}/stale.jpg`;
    mocks.bucket.createSignedUrl
      .mockResolvedValueOnce(signed("https://signed.example/old"))
      .mockResolvedValueOnce(signed("https://signed.example/new"));
    const first = renderHook(() => useDogPhotoUrl(path));
    await waitFor(() => expect(first.result.current).toBe("https://signed.example/old"));
    first.unmount();

    vi.setSystemTime(new Date("2026-11-15T09:58:00Z"));
    const second = renderHook(() => useDogPhotoUrl(path));
    expect(second.result.current).toBeNull();
    await waitFor(() => expect(second.result.current).toBe("https://signed.example/new"));
    expect(mocks.bucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
