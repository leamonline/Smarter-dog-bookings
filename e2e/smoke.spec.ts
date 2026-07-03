import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("staff app lands on the weekly calendar in offline mode", async ({
    page,
  }) => {
    // VITE_FORCE_OFFLINE=1 disables the auth gate so the calendar renders
    // straight away (see routeGuards.getStaffAuthRouteState: !isOnline → allow).
    await page.goto("/");
    await expect(page).toHaveURL(/\/(?:\?|$)/);
    // The "New booking" toolbar action is the most stable landmark for the
    // app shell — since the Today mobile redesign it's the one persistent
    // header CTA on every viewport (mobile moved "New client" into the menu).
    await expect(
      page.getByRole("button", { name: /new booking/i }).first(),
    ).toBeVisible();
  });

  test("today command centre renders its heading and live subline", async ({
    page,
  }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/today/);
    // Exactly one page heading — the shell's context row stands down here.
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByText(/dogs? booked/i).first()).toBeVisible();
    // The primary nav is labelled, not icon-only.
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Today" }).first(),
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
