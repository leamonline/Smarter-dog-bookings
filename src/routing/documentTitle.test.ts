import { describe, expect, it } from "vitest";
import { documentTitleFor, normaliseTitlePath } from "./documentTitle";

describe("documentTitleFor", () => {
  it.each([
    ["staff", "/today", "Daily Brief", "in", "Daily Brief · Smarter Dog"],
    ["staff", "/inbox", "Inbox", "in", "Inbox · Smarter Dog"],
    ["staff", "/today", "Daily Brief", "out", "Staff sign in · Smarter Dog"],
    ["customer", "/login", null, "out", "Sign in · Smarter Dog Bookings"],
    ["customer", "/login", null, "in", "My bookings · Smarter Dog Bookings"],
    ["customer", "/login/", null, "in", "My bookings · Smarter Dog Bookings"],
    ["customer", "/", null, "out", "Sign in · Smarter Dog Bookings"],
    ["customer", "/new", null, "in", "Book a groom · Smarter Dog Bookings"],
    ["customer", "/", null, "in", "My bookings · Smarter Dog Bookings"],
    ["staff", "/today", "Daily Brief", "denied", "Staff access needed · Smarter Dog"],
    ["customer", "/news", null, "in", "My bookings · Smarter Dog Bookings"],
    ["customer", "/login-history", null, "in", "My bookings · Smarter Dog Bookings"],
    ["customer", "/new/", null, "in", "Book a groom · Smarter Dog Bookings"],
    ["staff", "/today", "Daily Brief", "loading", "Smarter Dog"],
    ["customer", "/new", null, "setup", "Your account · Smarter Dog Bookings"],
    ["customer", "/NEW//", null, "in", "Book a groom · Smarter Dog Bookings"],
    ["customer", "/Login", null, "in", "My bookings · Smarter Dog Bookings"],
    ["customer", "//new", null, "in", "My bookings · Smarter Dog Bookings"],
    ["reset-password", "/reset-password", null, "in", "Reset password · Smarter Dog Bookings"],
  ] as const)("%s %s (%s) → %s", (mount, path, section, auth, expected) => {
    expect(documentTitleFor(mount, path, section, auth)).toBe(expected);
  });

  it("never shows a bare suffix-less title or the old shared one", () => {
    const t = documentTitleFor("staff", "/dogs/1", "Dogs");
    expect(t).not.toBe("SmarterDog — Salon Bookings");
    expect(t).toBe("Dogs · Smarter Dog");
  });
});

describe("normaliseTitlePath", () => {
  it.each([
    ["/DOGS/123", "/dogs/123"],
    ["/new//", "/new"],
    ["//today", "//today"],
    ["//new", "//new"],
    ["/", "/"],
    ["", "/"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseTitlePath(raw)).toBe(expected);
  });
});
