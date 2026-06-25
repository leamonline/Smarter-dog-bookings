// Convert a base64url VAPID public key into the Uint8Array that
// PushManager.subscribe() expects as `applicationServerKey`.
//
// Pure + side-effect-free so it can be unit-tested headlessly. Returned as
// Uint8Array<ArrayBuffer> to satisfy TS 6's BufferSource typing.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
