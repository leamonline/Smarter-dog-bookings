import { test, expect, type Page } from "@playwright/test";
import { LARGE_DOG_SLOTS } from "../src/constants/salon";

// Regression guard for UX-AUDIT-REPORT Top 5 #2: the Settings page used to
// render blank below the first two sections (long-scroll layout painting
// bug). It was rebuilt with desktop tabs and grouped mobile navigation
// (5d7c53f); these tests walk every section and assert each panel actually
// surfaces content, so a blank panel can never quietly ship again.
//
// The e2e harness runs with VITE_FORCE_OFFLINE=1 (sample data, no Supabase),
// where settings are editable (canEdit = isOwner || !isOnline). Two tabs are
// asserted on visible content rather than controls: Calendar Sync, whose
// interactive controls need a live Supabase feed-token RPC so offline it
// legitimately sits in its loading state, and Capacity Engine, which is
// read-only by design (AUDIT-1) — see its dedicated test below.
const TABS_WITH_CONTROLS = [
  "Your Business",
  "Hours & Closures",
  "Your Account",
  "Services & Pricing",
  "Booking Rules",
  "Customer Portal",
  "Notifications",
] as const;

const INTERACTIVE = "button, input, select, textarea, [role='switch']";

const MOBILE_GROUP_BY_SECTION: Record<string, string> = {
  "Your Business": "Salon",
  "Hours & Closures": "Salon",
  "Services & Pricing": "Salon",
  "Booking Rules": "Bookings",
  "Capacity Engine": "Bookings",
  "Customer Portal": "Tools & connections",
  Notifications: "Tools & connections",
  "Calendar Sync": "Tools & connections",
  "Your Account": "Account",
};

async function openSettingsSection(page: Page, label: string) {
  const isMobile = (page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 767;

  if (isMobile) {
    const group = page.getByRole("button", {
      name: MOBILE_GROUP_BY_SECTION[label],
      exact: true,
    });
    await group.click();
    await expect(group).toHaveAttribute("aria-pressed", "true");

    const section = page.getByRole("button", { name: label, exact: true });
    await section.click();
    await expect(section).toHaveAttribute("aria-current", "page");
    return;
  }

  const tab = page.getByRole("tab", { name: label });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test.describe("Settings tabs", () => {
  for (const label of TABS_WITH_CONTROLS) {
    test(`"${label}" tab paints interactive content`, async ({ page }) => {
      await page.goto("/settings");
      await openSettingsSection(page, label);

      const panel = page.locator("#settings-panel");
      await expect(panel).toBeVisible();
      // The original bug left panels present in the DOM but not painting —
      // so the assertion is on *visible* interactive content, not existence.
      await expect(panel.locator(INTERACTIVE).first()).toBeVisible();
    });
  }

  // Capacity Engine is deliberately a zero-control card (AUDIT-1): the 2-2-1
  // rules are hardcoded in the engine, so the panel renders them straight off
  // LARGE_DOG_SLOTS instead of offering placebo toggles. Assert the content
  // paints and pin the read-only contract, so re-adding controls here forces
  // the tab back into TABS_WITH_CONTROLS.
  test(`"Capacity Engine" tab paints its read-only content`, async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Capacity Engine");

    const panel = page.locator("#settings-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("What the 2-2-1 rule means")).toBeVisible();
    for (const time of Object.keys(LARGE_DOG_SLOTS)) {
      await expect(panel.getByText(time, { exact: true })).toBeVisible();
    }
    await expect(panel.locator(INTERACTIVE)).toHaveCount(0);
  });

  test(`"Calendar Sync" tab paints its content offline`, async ({ page }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Calendar Sync");

    const panel = page.locator("#settings-panel");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: /staff calendar feed/i }),
    ).toBeVisible();
    await expect(panel.getByText(/how to subscribe/i)).toBeVisible();
  });
});
