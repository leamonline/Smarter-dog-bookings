import { expect, test } from "@playwright/test";
import { customer, query, resetDatabase, signIn } from "./support/portal";

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
  if (process.env.CUSTOMER_E2E_STUB_PHONE_CHECK === "1") {
    await page.route("**/functions/v1/customer-phone-on-file", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on_file: true, has_password: true }) }),
    );
  }
  await page.goto("/book");
  await page.locator('input[type="tel"]').fill(sam.phoneTyped);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[type="password"]').fill("definitely-not-the-password");
  await expect(page.getByText("Security check complete.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Hi, ${sam.name}` })).toHaveCount(0);
});
