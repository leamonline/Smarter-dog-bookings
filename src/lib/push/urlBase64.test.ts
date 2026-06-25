import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./urlBase64";

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url string with - and _ and no padding", () => {
    // "subjects?" → standard base64 "c3ViamVjdHM/", base64url "c3ViamVjdHM_"
    const out = urlBase64ToUint8Array("c3ViamVjdHM_");
    expect(new TextDecoder().decode(out)).toBe("subjects?");
  });

  it("round-trips an arbitrary byte sequence", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 64, 128]);
    const b64url = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(Array.from(bytes));
  });

  it("produces a 65-byte array for a typical VAPID public key", () => {
    // A real uncompressed P-256 point is 65 bytes → 88 base64url chars.
    const key =
      "BIAGnzKaPk-g8JCNWnjXv6n1xsVZ9ms-S4L_OBKGvCxCNSgu8AIorI154X5R4MrXeAqGg3VaATJzvWES-CLKyog";
    const out = urlBase64ToUint8Array(key);
    expect(out.length).toBe(65);
    expect(out[0]).toBe(0x04); // uncompressed-point marker
  });
});
