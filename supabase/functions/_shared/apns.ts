// ============================================================
// supabase/functions/_shared/apns.ts
//
// Apple Push Notification service, token-based (.p8) auth.
//
// The private key never leaves the Edge Function secret APNS_PRIVATE_KEY.
// This module builds the provider JWT (ES256), posts one alert to APNs over
// HTTP/2 (Deno's fetch negotiates it; APNs refuses HTTP/1.1), and classifies
// the reply so a dead device token can be removed without treating an auth
// or outage error as a dead token.
//
// Docs: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
// ============================================================

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsSendResult =
  | { kind: "sent"; apnsId: string | null }
  | { kind: "invalid_token"; status: number; reason: string }
  | { kind: "rejected"; status: number; reason: string }
  | { kind: "unavailable"; status: number; reason: string };

const INVALID_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

export function normaliseApnsToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const hex = raw.replace(/[\s<>]/g, "").toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(hex)) return null;
  return hex;
}

export function normaliseApnsEnvironment(raw: unknown): ApnsEnvironment | null {
  if (raw === "sandbox" || raw === "production") return raw;
  return null;
}

/** Reverse-DNS bundle id. Rejects empties, spaces and ".." so a topic cannot be smuggled. */
export function normaliseBundleId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (id.length < 3 || id.length > 200) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(id)) return null;
  if (id.includes("..")) return null;
  return id;
}

/** Supabase secrets are often one line, with the PEM's breaks stored as the two characters \n. */
export function normalisePem(raw: string): string {
  const trimmed = raw.trim().replace(/\r\n/g, "\n");
  if (trimmed.includes("\\n")) return trimmed.replace(/\\n/g, "\n");
  return trimmed;
}

export function apnsHost(environment: ApnsEnvironment): string {
  return environment === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = normalisePem(pem).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Apple provider token. Header is alg + kid (the Key ID). Claims are iss
 * (the Team ID) and iat. Apple treats the token as valid for one hour from iat.
 */
export async function buildApnsJwt(args: {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
  nowSeconds?: number;
}): Promise<string> {
  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const enc = (value: unknown) =>
    bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signingInput = `${enc({ alg: "ES256", kid: args.keyId })}.${enc({ iss: args.teamId, iat: nowSeconds })}`;
  const key = await importSigningKey(args.privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

function reasonFromBody(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { reason?: unknown };
    return typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "";
  } catch {
    return "";
  }
}

/** Classify an APNs HTTP response. 410 and the dead-token reasons drop the device; auth and outage errors do not. */
export function classifyApnsResponse(status: number, bodyText: string): ApnsSendResult {
  const reason = reasonFromBody(bodyText);
  if (status === 200) return { kind: "sent", apnsId: null };
  if (status === 410 || INVALID_TOKEN_REASONS.has(reason)) {
    return { kind: "invalid_token", status, reason: reason || "Unregistered" };
  }
  if (status === 429 || status >= 500) {
    return { kind: "unavailable", status, reason: reason || `http_${status}` };
  }
  return { kind: "rejected", status, reason: reason || `http_${status}` };
}

export interface ApnsAlert {
  deviceToken: string;
  environment: ApnsEnvironment;
  bundleId: string;
  title: string;
  body: string;
  collapseId?: string;
  /** Extra JSON keys beside `aps`. Values are strings. Never put a phone number or address here. */
  data?: Record<string, string>;
}

export async function sendApnsAlert(
  alert: ApnsAlert,
  secrets: { keyId: string; teamId: string; privateKeyPem: string },
  fetchImpl: typeof fetch = fetch,
  nowSeconds?: number,
): Promise<ApnsSendResult> {
  const jwt = await buildApnsJwt({ ...secrets, nowSeconds });
  const payload: Record<string, unknown> = {
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: "default",
    },
  };
  for (const [key, value] of Object.entries(alert.data ?? {})) {
    if (key !== "aps") payload[key] = value;
  }
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": alert.bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
  };
  if (alert.collapseId) headers["apns-collapse-id"] = alert.collapseId.slice(0, 64);
  let res: Response;
  try {
    res = await fetchImpl(`${apnsHost(alert.environment)}/3/device/${alert.deviceToken}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "unavailable", status: 0, reason: message };
  }
  const text = await res.text();
  const classified = classifyApnsResponse(res.status, text);
  if (classified.kind === "sent") {
    return { kind: "sent", apnsId: res.headers.get("apns-id") };
  }
  return classified;
}
