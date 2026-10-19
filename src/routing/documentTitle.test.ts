import { describe, expect, it } from "vitest";
import { documentTitleFor } from "./documentTitle";

describe("documentTitleFor", () => {
  it.each([
    ["staff", "/today", "Daily Brief", true, "Daily Brief · Smarter Dog"],
    ["staff", "/inbox", "Inbox", true, "Inbox · Smarter Dog"],
    ["staff", "/today", "Daily Brief", false, "Staff sign in · Smarter Dog"],
    ["customer", "/login", null, true, "Sign in · Smarter Dog Bookings"],
    ["customer", "/", null, false, "Sign in · Smarter Dog Bookings"],
    ["customer", "/new", null, true, "Book a groom · Smarter Dog Bookings"],
    ["customer", "/", null, true, "My bookings · Smarter Dog Bookings"],
    ["reset-password", "/reset-password", null, true, "Reset password · Smarter Dog Bookings"],
  ] as const)("%s %s → %s", (mount, path, section, signedIn, expected) => {
    expect(documentTitleFor(mount, path, section, signedIn)).toBe(expected);
  });

  it("never shows a bare suffix-less title or the old shared one", () => {
    const t = documentTitleFor("staff", "/dogs/1", "Dogs");
    expect(t).not.toBe("SmarterDog — Salon Bookings");
    expect(t).toBe("Dogs · Smarter Dog");
  });
});
