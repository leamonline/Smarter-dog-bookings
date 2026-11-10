import { expect, test } from "@playwright/test";
import { customer, enterPhone, query, resetDatabase, signIn } from "./support/portal";

test.beforeEach(resetDatabase);

test("a customer signs in with phone and password and sees their own dogs", async ({ page }) => {
  await signIn(page, "sam");

  const sam = customer("sam");
  for (const dog of sam.dogs) {
    await expect(page.getByText(dog.name).first()).toBeVisible();
  }
  // Another customer's dog must never appear.
  await expect(page.getByText(customer("alex").dogs[0].name)).toHaveCount(0);

  // The sign-in belongs to the seeded synthetic record, not a new one.
  expect(query(`select count(*) from public.humans where customer_user_id = '${sam.authUserId}'`)).toEqual([["1"]]);
});

test("a wrong password is refused and no session starts", async ({ page }) => {
  const sam = customer("sam");
  await enterPhone(page, sam.phoneTyped);
  await page.locator('input[type="password"]').fill("definitely-not-the-password");
  await expect(page.getByText("Security check complete.")).toBeVisible({ timeout: 30_000 });
  // Wait for the auth server's own answer. The page keeps an empty alert
  // mounted for screen readers, so "an alert exists" proves nothing, and
  // "no greeting yet" is true before any answer arrives.
  const answer = page.waitForResponse(
    (response) =>
      response.url().includes("/auth/v1/token") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await answer).status(), "the auth server refuses the password").toBe(400);

  // The refusal is shown, in words.
  await expect(page.locator(".portal-alert--error")).toHaveText(/\S/);
  // Still on the password step, not the dashboard.
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: `Hi, ${sam.name}` })).toHaveCount(0);
  // And the auth server holds no session for this customer.
  expect(query(`select count(*) from auth.sessions where user_id = '${sam.authUserId}'`)).toEqual([["0"]]);
});
