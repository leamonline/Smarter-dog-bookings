import { describe, expect, it } from "vitest";
import { DogPhotoError, friendlyDogPhotoError, MAX_EDGE, targetSize } from "./dogPhoto";

describe("targetSize", () => {
  it("scales the longest side down to the limit, keeping the shape", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: MAX_EDGE, height: 900 });
    expect(targetSize(3024, 4032)).toEqual({ width: 900, height: MAX_EDGE });
  });

  it("never upscales a small photo", () => {
    expect(targetSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("answers zero for a photo with no size", () => {
    expect(targetSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(targetSize(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("friendlyDogPhotoError", () => {
  it("names the problem for each known reason", () => {
    expect(friendlyDogPhotoError(new DogPhotoError("not_image"))).toMatch(/isn't a photo/);
    expect(friendlyDogPhotoError(new DogPhotoError("too_large"))).toMatch(/too big/);
    expect(friendlyDogPhotoError(new DogPhotoError("unreadable"))).toMatch(/couldn't read/);
  });

  it("falls back to a generic line for anything else", () => {
    expect(friendlyDogPhotoError(new Error("network"))).toBe("We couldn't save the photo. Please try again.");
  });
});
