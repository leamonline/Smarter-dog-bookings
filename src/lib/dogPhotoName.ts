// Object names for the dog-photos bucket: <dog uuid>/<random uuid>.jpg. Shared by
// the customer and staff upload hooks; the storage policies and
// set_customer_dog_photo accept only this shape.

// A version-4 UUID. set_customer_dog_photo accepts only a canonical 8-4-4-4-12
// lowercase hex name, so every branch must produce exactly that.
// crypto.randomUUID is missing on iOS before 15.4; getRandomValues is not.
function randomUuid(): string {
  const webCrypto = typeof crypto !== "undefined" ? crypto : undefined;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newDogPhotoObjectName(dogId: string): string {
  return `${dogId}/${randomUuid()}.jpg`;
}
