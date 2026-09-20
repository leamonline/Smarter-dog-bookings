import * as Sentry from "@sentry/react";

let initialized = false;

// Strip PII and credentials that can leak through error messages (Supabase
// 4xx response bodies, validation strings): UK phone numbers, email addresses,
// UK postcodes, bearer tokens and UUIDs. The reference ID shown to the user
// stays separate from the diagnostic event.
function redactPii(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(
      /(\+?44|0044|0)\s?[1-9]\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}/g,
      "[redacted-phone]",
    )
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, "[redacted-postcode]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+={0,2}/gi, "Bearer [redacted-token]")
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi, "[redacted-id]");
}

// Names, addresses and message bodies cannot be pattern-matched the way a
// phone number can — "Fido" is indistinguishable from any other word. So in
// STRUCTURED data they are redacted by key instead.
//
// The keys below are the schema's actual customer-data columns rather than a
// generic guess: humans (name, surname, address, notes, fb/insta/tiktok,
// history_flag), dogs (name, groom_notes, alerts) and whatsapp_messages
// (content, "plain-text body of the message"). This is why bare `name` is
// listed — in a Supabase request body it is a person's or a dog's name.
//
// Losing `name` from diagnostics costs little, because Sentry tags are not
// redacted at all: the `component` and `op` tags every logger.error call site
// sets still identify where a failure happened.
//
// `message` is deliberately NOT here. It is logger.error's own developer-authored
// summary and the primary diagnostic; it still goes through the pattern pass above.
// The list stays tied to columns that exist: singular `note` and `comment` were
// dropped for that reason, and because `note` is a common non-customer field.
const PII_KEY_MARKERS = new Map(
  [
    [["name", "surname", "firstname", "lastname", "fullname", "ownername", "dogname", "petname", "customername", "contactname"], "[redacted-name]"],
    [["address", "addressline1", "addressline2", "street", "city", "postcode", "postalcode", "zip"], "[redacted-address]"],
    [["notes", "groomnotes", "historyflag", "alerts"], "[redacted-notes]"],
    [["content", "body", "text", "caption", "messagebody"], "[redacted-content]"],
    [["fb", "insta", "instagram", "tiktok"], "[redacted-handle]"],
  ].flatMap(([keys, marker]) => keys.map((key) => [key, marker])),
);

// `full_name`, `fullName` and `FullName` are the same field wearing different
// casing conventions, so compare on letters alone.
function normaliseKey(key) {
  return key.toLowerCase().replace(/[^a-z]/g, "");
}

// Walk an object and redact string leaves, plus any value sitting under a
// customer-data key. Capped depth so a pathological structure can't hang
// beforeSend.
function redactDeep(value, depth = 0) {
  if (depth > 6) return value;
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const marker = PII_KEY_MARKERS.get(normaliseKey(k));
      if (!marker || v === null || v === undefined) {
        out[k] = redactDeep(v, depth + 1);
      } else if (Array.isArray(v)) {
        // Keep the shape (an array, and how many entries) without the values.
        out[k] = v.map(() => marker);
      } else if (typeof v === "object") {
        // A container under a sensitive key — `body: { name, slot }` — keeps
        // its structure and is walked, so the name goes and the slot stays.
        out[k] = redactDeep(v, depth + 1);
      } else {
        out[k] = marker;
      }
    }
    return out;
  }
  return value;
}

export function sentryBeforeSend(event) {
  if (!event) return event;
  if (event.message) event.message = redactPii(event.message);
  if (event.exception && Array.isArray(event.exception.values)) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: redactPii(ex.value),
    }));
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      message: redactPii(bc.message),
      data: bc.data ? redactDeep(bc.data) : bc.data,
    }));
  }
  if (event.extra) event.extra = redactDeep(event.extra);
  if (event.request) {
    if (event.request.url) event.request.url = redactPii(event.request.url);
    if (event.request.data) event.request.data = redactDeep(event.request.data);
  }
  return event;
}

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
  });
  initialized = true;
}

export function captureException(error, context) {
  if (!initialized) return;
  Sentry.captureException(error, context);
}
