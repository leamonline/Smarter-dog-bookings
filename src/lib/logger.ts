// Shared logger. Replaces bare console.error/warn/info in app code so:
//   - dev: messages keep landing in the browser console for visibility
//   - prod: error()-level messages forward to Sentry so customer-side
//     async failures stop disappearing into the void
//
// Adoption is incremental — only a few call sites are migrated for
// now; the rest follow as files are touched.
import { captureException } from "./sentry.js";

export interface LogContext {
  // Sentry tags are short string identifiers; values must also be
  // string-ish so the SDK doesn't reject them.
  tags?: Record<string, string | number | boolean | undefined>;
  // Extra free-form context the developer wants attached.
  extra?: Record<string, unknown>;
}

const isDev = (() => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
})();

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

export const logger = {
  error(message: string, errorOrContext?: unknown, maybeContext?: LogContext) {
    const error =
      errorOrContext && !isContext(errorOrContext)
        ? toError(errorOrContext)
        : toError(message);
    const context =
      isContext(errorOrContext) ? errorOrContext : maybeContext;

    if (isDev) {
      console.error(message, errorOrContext ?? "", context ?? "");
    }
    captureException(error, {
      tags: context?.tags,
      extra: { message, ...(context?.extra ?? {}) },
    });
  },

  warn(message: string, context?: LogContext) {
    if (isDev) {
      console.warn(message, context ?? "");
    }
  },

  info(message: string, context?: LogContext) {
    if (isDev) {
      console.info(message, context ?? "");
    }
  },
};

function isContext(value: unknown): value is LogContext {
  if (!value || typeof value !== "object") return false;
  const v = value as { tags?: unknown; extra?: unknown };
  return "tags" in v || "extra" in v;
}
