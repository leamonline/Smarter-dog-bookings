import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const bucket = { upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() };
  return {
    bucket,
    from: vi.fn(() => bucket),
    setCustomerDogPhoto: vi.fn(),
    prepareDogPhoto: vi.fn(),
  };
});

vi.mock("../customerClient", () => ({
  customerSupabase: { storage: { from: mocks.from } },
}));
vi.mock("../rpc", () => ({ setCustomerDogPhoto: mocks.setCustomerDogPhoto }));
vi.mock("../../lib/dogPhoto", () => ({ prepareDogPhoto: mocks.prepareDogPhoto }));

import { useCustomerDogPhoto } from "./useCustomerDogPhoto";

const DOG = "26300000-0000-4000-8000-000000000001";
const FILE = new File(["x"], "tipi.jpg", { type: "image/jpeg" });

beforeEach(() => {
  mocks.bucket.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.bucket.remove.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.setCustomerDogPhoto.mockReset().mockResolvedValue({ data: [{ previous_photo_path: null }], error: null });
  mocks.prepareDogPhoto.mockReset().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  mocks.from.mockClear();
});

describe("useCustomerDogPhoto", () => {
  it("uploads the prepared photo under a new name in the dog's folder, then points the dog at it", async () => {
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(error).toBeNull();
    expect(photoPath).toMatch(new RegExp(`^${DOG}/[0-9a-f-]{36}\\.jpg$`));
    expect(mocks.from).toHaveBeenCalledWith("dog-photos");
    const [path, blob, options] = mocks.bucket.upload.mock.calls[0];
    expect(path).toBe(photoPath);
    expect(blob.type).toBe("image/jpeg");
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(mocks.setCustomerDogPhoto).toHaveBeenCalledWith(expect.anything(), { dogId: DOG, photoPath });
    expect(mocks.bucket.remove).not.toHaveBeenCalled();
  });

  it("deletes the previous photo once the dog points at the new one", async () => {
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: [{ previous_photo_path: `${DOG}/old.jpg` }], error: null });
    const { result } = renderHook(() => useCustomerDogPhoto());
    await result.current.uploadDogPhoto(DOG, FILE);
    expect(mocks.bucket.remove).toHaveBeenCalledWith([`${DOG}/old.jpg`]);
  });

  it("deletes its own upload again when the database refuses it", async () => {
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: null, error: { message: "photo_not_uploaded" } });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { photoPath, error } = await result.current.uploadDogPhoto(DOG, FILE);
    expect(photoPath).toBeNull();
    expect(error).toEqual({ message: "photo_not_uploaded" });
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

  it("removing clears the dog first, then deletes the old file", async () => {
    mocks.setCustomerDogPhoto.mockResolvedValue({ data: [{ previous_photo_path: `${DOG}/old.jpg` }], error: null });
    const { result } = renderHook(() => useCustomerDogPhoto());
    const { error } = await result.current.removeDogPhoto(DOG);
    expect(error).toBeNull();
    expect(mocks.setCustomerDogPhoto).toHaveBeenCalledWith(expect.anything(), { dogId: DOG, photoPath: null });
    expect(mocks.bucket.remove).toHaveBeenCalledWith([`${DOG}/old.jpg`]);
  });
});
