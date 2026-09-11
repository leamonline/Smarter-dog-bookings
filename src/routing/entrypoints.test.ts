import { describe, it, expect } from "vitest";
import {
  resolveLegacyRedirect,
  resolveMount,
  CUSTOMER_BASENAME,
  STAFF_BASENAME,
} from "./entrypoints";

describe("resolveMount", () => {
  it("mounts the customer portal under /book", () => {
    for (const p of ["/book", "/book/", "/book/new", "/book/login"]) {
      expect(resolveMount(p), p).toEqual({ mount: "customer", basename: CUSTOMER_BASENAME });
    }
  });

  it("mounts the staff app under /staff", () => {
    for (const p of ["/staff", "/staff/", "/staff/today", "/staff/dogs/abc-123"]) {
      expect(resolveMount(p), p).toEqual({ mount: "staff", basename: STAFF_BASENAME });
    }
  });

  it("keeps password reset outside both basenames", () => {
    // Both audiences follow the same emailed link, so it cannot sit under
    // either app's basename.
    expect(resolveMount("/reset-password")).toEqual({ mount: "reset-password", basename: "/" });
  });

  it("does not mistake a look-alike path for a portal", () => {
    // /bookings is a staff route and /stafflogin is the sign-in entrance;
    // a careless startsWith would swallow both.
    expect(resolveMount("/bookings")).toBeNull();
    expect(resolveMount("/stafflogin")).toBeNull();
    expect(resolveMount("/booking-workspace")).toBeNull();
  });

  it("declines paths that need a redirect first", () => {
    expect(resolveMount("/")).toBeNull();
    expect(resolveMount("/customer")).toBeNull();
  });
});

describe("resolveLegacyRedirect", () => {
  it("sends the staff entrance to the staff app", () => {
    expect(resolveLegacyRedirect("/stafflogin")).toBe("/staff/");
    expect(resolveLegacyRedirect("/stafflogin/")).toBe("/staff/");
  });

  it("maps every old /customer URL onto its /book equivalent", () => {
    expect(resolveLegacyRedirect("/customer")).toBe("/book");
    expect(resolveLegacyRedirect("/customer/")).toBe("/book");
    expect(resolveLegacyRedirect("/customer/login")).toBe("/book/login");
    // The wizard is the one rename: "book" would have read as /book/book.
    expect(resolveLegacyRedirect("/customer/book")).toBe("/book/new");
  });

  it("keeps old staff bookmarks and the vercel.app root working", () => {
    expect(resolveLegacyRedirect("/")).toBe("/staff/");
    expect(resolveLegacyRedirect("/today")).toBe("/staff/today");
    expect(resolveLegacyRedirect("/inbox")).toBe("/staff/inbox");
    expect(resolveLegacyRedirect("/dogs/abc-123")).toBe("/staff/dogs/abc-123");
    expect(resolveLegacyRedirect("/bookings")).toBe("/staff/bookings");
  });

  it("leaves paths that are already home alone", () => {
    for (const p of ["/book", "/book/new", "/staff", "/staff/today", "/reset-password"]) {
      expect(resolveLegacyRedirect(p), p).toBeNull();
    }
  });

  it("never redirects a path onto itself", () => {
    // A redirect that returns its own input is an infinite reload loop.
    for (const p of ["/", "/today", "/customer", "/customer/book", "/stafflogin", "/book", "/staff/today"]) {
      expect(resolveLegacyRedirect(p), p).not.toBe(p);
    }
  });

  it("always leaves a path either mountable or redirectable, never neither", () => {
    // index.jsx destructures resolveMount's result when there is no redirect,
    // so a path that satisfies neither would throw at boot.
    for (const p of ["/", "/book", "/staff", "/stafflogin", "/customer", "/reset-password",
                     "/today", "/bookings", "/anything/else", "/book/new", "/staff/dogs/x"]) {
      const redirected = resolveLegacyRedirect(p) !== null;
      const mountable = resolveMount(p) !== null;
      expect(redirected || mountable, p).toBe(true);
      expect(redirected && mountable, p).toBe(false);
    }
  });

  it("hands every redirect target back to a real mount", () => {
    // Two hops would mean the browser reloads twice.
    for (const p of ["/", "/today", "/customer", "/customer/book", "/customer/login", "/stafflogin"]) {
      const target = resolveLegacyRedirect(p) as string;
      expect(resolveLegacyRedirect(target), `${p} -> ${target}`).toBeNull();
      expect(resolveMount(target), `${p} -> ${target}`).not.toBeNull();
    }
  });
});
