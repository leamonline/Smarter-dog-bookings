import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("staff app lands on the weekly calendar in offline mode", async ({
    page,
  }) => {
    // VITE_FORCE_OFFLINE=1 disables the auth gate so the calendar renders
    // straight away (see routeGuards.getStaffAuthRouteState: !isOnline → allow).
    await page.goto("/");
    await expect(page).toHaveURL(/\/(?:\?|$)/);
    // The "New client" toolbar action is the most stable landmark for the
    // calendar shell — it's the one header CTA present on every viewport.
    // (Post the staff-bookings redesign #446, "New booking" is a desktop-only
    // CTA; mobile/tablet lead with "New client" + per-slot booking.)
    await expect(
      page.getByRole("button", { name: /new client/i }).first(),
    ).toBeVisible();
  });

  test("customer portal shows the phone OTP entry screen", async ({ page }) => {
    await page.goto("/customer");
    await expect(page).toHaveURL(/\/customer\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('input[inputmode="numeric"]').first()).toBeVisible();
  });

  test("reset password route renders without 404", async ({ page }) => {
    const response = await page.goto("/reset-password");
    expect(response?.ok()).toBe(true);
    await expect(page.locator("#root")).not.toBeEmpty();
  });

  test("staff can navigate to the dogs directory", async ({ page }) => {
    await page.goto("/dogs");
    await expect(page).toHaveURL(/\/dogs/);
    // Main content renders something; sample data should populate the
    // directory but at minimum we want a non-empty <main>.
    await expect(page.locator("main#main-content")).not.toBeEmpty();
  });

  test("staff can navigate to the humans directory", async ({ page }) => {
    await page.goto("/humans");
    await expect(page).toHaveURL(/\/humans/);
    await expect(page.locator("main#main-content")).not.toBeEmpty();
  });

  test("staff can navigate to the settings page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading", { name: /salon settings/i }).first(),
    ).toBeVisible();
  });

  test("staff can navigate to the inbox", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/inbox/);
    await expect(page.locator("main#main-content")).toBeAttached();
  });

  test("main content landmark is present and is a <main>", async ({ page }) => {
    await page.goto("/");
    // The skip link targets #main-content. Make sure that element is a
    // <main> landmark, not just a <div> with the right id.
    const mainContent = page.locator("main#main-content");
    await expect(mainContent).toBeAttached();
  });
});
