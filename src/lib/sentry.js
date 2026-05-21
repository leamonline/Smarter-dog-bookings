import * as Sentry from "@sentry/react";

let initialized = false;

// Strip PII that we have seen leak through error messages (Supabase
// 4xx response bodies, validation strings) — UK phone numbers and
// email addresses. Anything else stays untouched.
function redactPii(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(
      /(\+?44|0044|0)\s?[1-9]\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}/g,
      "[redacted-phone]",
    )
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]");
}

// Walk an object and redact string leaves. Capped depth so a
// pathological structure can't hang beforeSend.
function redactDeep(value, depth = 0) {
  if (depth > 6) return value;
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactDeep(v, depth + 1);
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
