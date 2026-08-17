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

  it("redacts bearer tokens and UUIDs from diagnostic text", () => {
    const out = sentryBeforeSend({
      message: "Bearer eyJhbGciOiJIUzI1NiJ9.abc.def failed for 6f62d7f2-6d69-4a18-9a66-c0a80ca46de5",
    });
    expect(out.message).toBe("Bearer [redacted-token] failed for [redacted-id]");
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

  // A name cannot be pattern-matched — "Fido" looks like any other word — so
  // structured customer data is redacted by key. The keys mirror the schema's
  // real customer columns: humans, dogs and whatsapp_messages.
  describe("structured customer data", () => {
    it("redacts owner and dog names, which no pattern could catch", () => {
      const out = sentryBeforeSend({
        extra: { name: "Fido", surname: "Postlethwaite", dogName: "Biscuit" },
      });
      expect(out.extra).toEqual({
        name: "[redacted-name]",
        surname: "[redacted-name]",
        dogName: "[redacted-name]",
      });
    });

    it("matches the same field across snake_case, camelCase and capitalisation", () => {
      const out = sentryBeforeSend({
        extra: { full_name: "Ada L", fullName: "Ada L", FullName: "Ada L" },
      });
      expect(Object.values(out.extra)).toEqual([
        "[redacted-name]",
        "[redacted-name]",
        "[redacted-name]",
      ]);
    });

    it("redacts addresses, notes and social handles", () => {
      const out = sentryBeforeSend({
        extra: {
          address: "12 Hillcrest Road",
          notes: "Owner prefers afternoons",
          groom_notes: "Nervous around clippers",
          insta: "@someone",
        },
      });
      expect(out.extra).toEqual({
        address: "[redacted-address]",
        notes: "[redacted-notes]",
        groom_notes: "[redacted-notes]",
        insta: "[redacted-handle]",
      });
    });

    it("redacts conversation content, including WhatsApp message bodies", () => {
      const out = sentryBeforeSend({
        extra: { content: "Can I move Tuesday to Wednesday please?" },
        request: { data: { body: "Sorry, running 10 minutes late!" } },
      });
      expect(out.extra.content).toBe("[redacted-content]");
      expect(out.request.data.body).toBe("[redacted-content]");
    });

    it("keeps non-customer fields alongside redacted ones", () => {
      const out = sentryBeforeSend({
        extra: { body: { name: "Fido", slot: "09:00", size: "large" } },
      });
      // The container keeps its shape and is walked, so the operational
      // detail that makes the report useful survives.
      expect(out.extra.body).toEqual({
        name: "[redacted-name]",
        slot: "09:00",
        size: "large",
      });
    });

    it("keeps array shape without the values", () => {
      const out = sentryBeforeSend({
        extra: { alerts: ["bites when nervous", "arthritis"] },
      });
      expect(out.extra.alerts).toEqual(["[redacted-notes]", "[redacted-notes]"]);
    });

    it("redacts customer data inside breadcrumb data", () => {
      const out = sentryBeforeSend({
        breadcrumbs: [
          { message: "POST /rest/v1/humans", data: { name: "Ada", address: "12 Hillcrest Road" } },
        ],
      });
      expect(out.breadcrumbs[0].data).toEqual({
        name: "[redacted-name]",
        address: "[redacted-address]",
      });
      expect(out.breadcrumbs[0].message).toBe("POST /rest/v1/humans");
    });

    it("redacts UK postcodes wherever they appear as free text", () => {
      const out = sentryBeforeSend({ message: "Delivery to SW1A 1AA failed" });
      expect(out.message).toBe("Delivery to [redacted-postcode] failed");
    });

    it("preserves the developer's own log summary", () => {
      // logger.error puts its message into extra. It is the primary diagnostic
      // and developer-authored, so it is redacted by pattern but never by key.
      const out = sentryBeforeSend({
        extra: { message: "Failed to fetch day closures", name: "Fido" },
      });
      expect(out.extra.message).toBe("Failed to fetch day closures");
      expect(out.extra.name).toBe("[redacted-name]");
    });

    it("leaves null and undefined at sensitive keys alone", () => {
      const out = sentryBeforeSend({ extra: { name: null, address: undefined } });
      expect(out.extra.name).toBeNull();
      expect(out.extra.address).toBeUndefined();
    });
  });
});
