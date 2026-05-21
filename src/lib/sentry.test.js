import { describe, it, expect } from "vitest";
import { sentryBeforeSend } from "./sentry.js";

describe("sentryBeforeSend", () => {
  it("redacts UK mobile in event.message", () => {
    const out = sentryBeforeSend({ message: "Call from 07507731487 failed" });
    expect(out.message).toBe("Call from [redacted-phone] failed");
  });

  it("redacts +44-prefixed UK mobile with spaces", () => {
    const out = sentryBeforeSend({ message: "From +44 7507 731 487" });
    expect(out.message).toContain("[redacted-phone]");
    expect(out.message).not.toMatch(/7507/);
  });

  it("redacts emails", () => {
    const out = sentryBeforeSend({
      message: "User leam@leamonline.uk submitted",
    });
    expect(out.message).toBe("User [redacted-email] submitted");
  });

  it("redacts both in one string", () => {
    const out = sentryBeforeSend({
      message: "Contact 07507731487 or test+tag@example.co.uk",
    });
    expect(out.message).toBe(
      "Contact [redacted-phone] or [redacted-email]",
    );
  });

  it("redacts inside exception.values[].value", () => {
    const out = sentryBeforeSend({
      exception: {
        values: [
          { type: "Error", value: "Invalid phone 07507731487" },
          { type: "TypeError", value: "no PII here" },
        ],
      },
    });
    expect(out.exception.values[0].value).toBe(
      "Invalid phone [redacted-phone]",
    );
    expect(out.exception.values[1].value).toBe("no PII here");
  });

  it("redacts inside breadcrumb messages and data", () => {
    const out = sentryBeforeSend({
      breadcrumbs: [
        {
          message: "POST /api with email leam@example.com",
          data: { from: "07507731487", note: "ok" },
        },
      ],
    });
    expect(out.breadcrumbs[0].message).toContain("[redacted-email]");
    expect(out.breadcrumbs[0].data.from).toBe("[redacted-phone]");
    expect(out.breadcrumbs[0].data.note).toBe("ok");
  });

  it("redacts inside nested extra", () => {
    const out = sentryBeforeSend({
      extra: { user: { contact: { phone: "07507731487" } } },
    });
    expect(out.extra.user.contact.phone).toBe("[redacted-phone]");
  });

  it("redacts inside request.url and request.data", () => {
    const out = sentryBeforeSend({
      request: {
        url: "/search?q=07507731487",
        data: { email: "leam@example.com" },
      },
    });
    expect(out.request.url).toBe("/search?q=[redacted-phone]");
    expect(out.request.data.email).toBe("[redacted-email]");
  });

  it("returns event unchanged when there is no PII", () => {
    const event = { message: "build failed: chunk not found" };
    const out = sentryBeforeSend(event);
    expect(out.message).toBe("build failed: chunk not found");
  });

  it("handles null / missing fields gracefully", () => {
    expect(() => sentryBeforeSend(null)).not.toThrow();
    expect(() => sentryBeforeSend({})).not.toThrow();
    expect(() => sentryBeforeSend({ message: null })).not.toThrow();
  });

  it("does not recurse past the depth cap", () => {
    let deep = "07507731487";
    for (let i = 0; i < 10; i += 1) deep = { nested: deep };
    expect(() => sentryBeforeSend({ extra: { deep } })).not.toThrow();
  });
});
