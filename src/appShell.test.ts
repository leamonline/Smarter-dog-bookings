/**
 * Debt 11 ratchet — App.jsx is the staff shell, not the hub.
 *
 * The September 2026 extraction moved the data layer to useStaffAppData,
 * the drawer session to useBookingSession, profile URLs to
 * useProfileRouting, the route map to StaffRoutes and the modal stack to
 * StaffModals. This test keeps them out: the register item moved the
 * wrong way three reviews running because nothing pushed back.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.jsx", import.meta.url)), "utf8");
const lineCount = appSource.split("\n").length;

describe("App.jsx stays a thin shell (Debt 11)", () => {
  it("stays under the post-extraction line budget", () => {
    // 546 lines after the extraction (1,544 before). Lower this as the
    // shell shrinks further; never raise it to fit a feature.
    expect(lineCount).toBeLessThanOrEqual(600);
  });

  it("does not declare the data hooks inline", () => {
    for (const hook of [
      "useHumans(",
      "useDogs(",
      "useBookings(",
      "useSalonConfig(",
      "useDaySettings(",
      "useOfflineState(",
      "useBookingActions(",
    ]) {
      expect(appSource, `${hook} belongs in useStaffAppData`).not.toContain(hook);
    }
  });

  it("lazy-loads only the pre-auth chunks (login, analytics, dev catalogue)", () => {
    // Views live in StaffRoutes, modals in StaffModals. ROUTE_CHUNK_IMPORTS
    // may still name view modules — that is the auth-gate warm-up, not a
    // route declaration — so count lazy() declarations rather than paths.
    const lazyCount = (appSource.match(/\blazy\(\(\)\s*=>/g) || []).length;
    expect(lazyCount).toBeLessThanOrEqual(3);
    expect(appSource).not.toContain("<Routes>");
    expect(appSource).not.toContain("components/modals/");
  });

  it("composes the extracted shell pieces", () => {
    for (const piece of [
      "useStaffAppData(",
      "useBookingSession(",
      "useProfileRouting(",
      "<StaffRoutes",
      "<StaffModals",
    ]) {
      expect(appSource).toContain(piece);
    }
  });
});
