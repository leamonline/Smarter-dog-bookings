import { describe, expect, it } from "vitest";
import {
  base64UrlToUint8Array,
  buildVapidJwt,
  encryptPayload,
  uint8ArrayToBase64Url,
  type VapidDetails,
  type WebPushSubscription,
} from "../../../supabase/functions/_shared/webpush.ts";

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  len: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8),
  );
}

describe("base64url helpers", () => {
  it("round-trip encode/decode arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 90, 0x04]);
    const b64 = uint8ArrayToBase64Url(bytes);
    expect(b64).not.toMatch(/[+/=]/); // url-safe, unpadded
    expect(Array.from(base64UrlToUint8Array(b64))).toEqual(Array.from(bytes));
  });
});

describe("encryptPayload (RFC 8291 aes128gcm)", () => {
  it("produces a body the client key can decrypt back to the plaintext", async () => {
    // Stand-in client (user agent) key pair + auth secret.
    const uaKeys = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", uaKeys.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));

    const sub: WebPushSubscription = {
      endpoint: "https://web.push.apple.com/token",
      p256dh: uint8ArrayToBase64Url(uaPublicRaw),
      auth: uint8ArrayToBase64Url(authSecret),
    };

    const plaintext = JSON.stringify({ title: "Hi", body: "There", url: "/" });
    const body = await encryptPayload(utf8(plaintext), sub);

    // Parse the aes128gcm header and decrypt with the UA private key.
    const salt = body.slice(0, 16);
    const idlen = body[20];
    const asPublicRaw = body.slice(21, 21 + idlen);
    const ciphertext = body.slice(21 + idlen);

    const asPublicKey = await crypto.subtle.importKey(
      "raw",
      asPublicRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, uaKeys.privateKey, 256),
    );
    const ikm = await hkdf(authSecret, shared, concat(utf8("WebPush: info\0"), uaPublicRaw, asPublicRaw), 32);
    const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

    const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, ciphertext),
    );
    const recovered = new TextDecoder().decode(decrypted.slice(0, decrypted.length - 1));
    expect(recovered).toBe(plaintext);
  });
});

describe("buildVapidJwt (RFC 8292 ES256)", () => {
  it("produces a JWT that verifies against the VAPID public key with correct claims", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const vapid: VapidDetails = {
      publicKey: uint8ArrayToBase64Url(pubRaw),
      privateKey: jwk.d as string,
      subject: "mailto:leam@leamonline.uk",
    };

    const audience = "https://web.push.apple.com";
    const jwt = await buildVapidJwt(audience, vapid, 1_700_000_000);
    const [h, p, s] = jwt.split(".");

    const verifyKey = await crypto.subtle.importKey(
      "raw",
      pubRaw,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64UrlToUint8Array(s),
      utf8(`${h}.${p}`),
    );
    expect(ok).toBe(true);

    const claims = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(p)));
    expect(claims.aud).toBe(audience);
    expect(claims.sub).toBe(vapid.subject);
    expect(claims.exp).toBe(1_700_000_000 + 12 * 60 * 60);
  });
});
