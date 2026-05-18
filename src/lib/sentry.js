import * as Sentry from "@sentry/react";

let initialized = false;

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
  });
  initialized = true;
}

export function captureException(error, context) {
  if (!initialized) return;
  Sentry.captureException(error, context);
}
