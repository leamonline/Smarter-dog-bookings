import { test, expect } from "@playwright/test";

// Regression guard for UX-AUDIT-REPORT Top 5 #2: the Settings page used to
// render blank below the first two sections (long-scroll layout painting
// bug). It was rebuilt as a tabbed interface (5d7c53f); these tests walk
// every tab and assert each panel actually surfaces content, so a blank
// panel can never quietly ship again.
//
// The e2e harness runs with VITE_FORCE_OFFLINE=1 (sample data, no Supabase),
// where settings are editable (canEdit = isOwner || !isOnline). Calendar
// Sync is the one tab whose interactive controls need a live Supabase
// feed-token RPC — offline it legitimately sits in its loading state, so we
// assert visible content rather than controls there.
const TABS_WITH_CONTROLS = [
  "Your Business",
  "Hours & Closures",
  "Your Account",
  "Services & Pricing",
  "Booking Rules",
  "Capacity Engine",
  "Customer Portal",
  "Notifications",
] as const;

const INTERACTIVE = "button, input, select, textarea, [role='switch']";

test.describe("Settings tabs", () => {
  for (const label of TABS_WITH_CONTROLS) {
    test(`"${label}" tab paints interactive content`, async ({ page }) => {
      await page.goto("/settings");
      const tab = page.getByRole("tab", { name: label });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");

      const panel = page.locator("#settings-panel");
      await expect(panel).toBeVisible();
      // The original bug left panels present in the DOM but not painting —
      // so the assertion is on *visible* interactive content, not existence.
      await expect(panel.locator(INTERACTIVE).first()).toBeVisible();
    });
  }

  test(`"Calendar Sync" tab paints its content offline`, async ({ page }) => {
    await page.goto("/settings");
    const tab = page.getByRole("tab", { name: "Calendar Sync" });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    const panel = page.locator("#settings-panel");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: /staff calendar feed/i }),
    ).toBeVisible();
    await expect(panel.getByText(/how to subscribe/i)).toBeVisible();
  });
});
