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
    // calendar shell — it sits in the header on every viewport.
    await expect(
      page.getByRole("button", { name: /new booking/i }).first(),
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
});
