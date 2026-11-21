import { describe, it, expect } from "vitest";
import { newDogPhotoObjectName } from "./dogPhotoName";

const DOG = "0b7e6f0a-1c2d-4e3f-8a9b-0c1d2e3f4a5b";

describe("newDogPhotoObjectName", () => {
  it("is <dog uuid>/<lowercase uuid>.jpg, the only shape the storage policies accept", () => {
    const name = newDogPhotoObjectName(DOG);
    expect(name).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
    expect(name.startsWith(`${DOG}/`)).toBe(true);
  });

  it("never reuses a name", () => {
    expect(newDogPhotoObjectName(DOG)).not.toBe(newDogPhotoObjectName(DOG));
  });
});
