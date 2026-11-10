import { expect, type Page } from "@playwright/test";
import { readLocalStack } from "../../scripts/customer-e2e/localStack.mjs";
import { seed } from "../../scripts/customer-e2e/seed.mjs";
import { LOCAL_DB } from "../../scripts/customer-e2e/localTarget.mjs";
import { customer, SYNTHETIC_PASSWORD } from "../../scripts/customer-e2e/syntheticData.mjs";
import { spawnSync } from "node:child_process";

export { customer };

/** Put the database back to its starting state. Call from `test.beforeEach`. */
export async function resetDatabase() {
  await seed(readLocalStack());
}

/**
 * Read from the local database, for asserting the row a journey wrote.
 * Returns one array of column values per row.
 */
export function query(sql: string): string[][] {
  const result = spawnSync(
    "psql",
    ["-h", LOCAL_DB.host, "-p", LOCAL_DB.port, "-U", LOCAL_DB.user, "-d", LOCAL_DB.database,
      "-X", "-q", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: LOCAL_DB.password } },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t"));
}

/** Run a statement against the local database (arranging a scenario). */
export function execute(sql: string): void {
  query(sql);
}

/**
 * Sign in through the real login page: phone, security check, password.
 *
 * The first step asks an Edge Function whether the phone is on file. Some
 * sandboxes cannot start local Edge Functions (their containers cannot fetch
 * Deno modules). Only there, CUSTOMER_E2E_STUB_PHONE_CHECK=1 answers that one
 * pre-sign-in lookup in the browser. It decides nothing about bookings, and CI
 * never sets it.
 */
export async function signIn(page: Page, key: "sam" | "alex" = "sam") {
  const who = customer(key);
  if (process.env.CUSTOMER_E2E_STUB_PHONE_CHECK === "1") {
    await page.route("**/functions/v1/customer-phone-on-file", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ on_file: true, has_password: true }),
      }),
    );
  }
  await page.goto("/book");
  await page.locator('input[type="tel"]').fill(who.phoneTyped);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[type="password"]').fill(SYNTHETIC_PASSWORD);
  await expect(page.getByText("Security check complete.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: `Hi, ${who.name}` })).toBeVisible({ timeout: 30_000 });
}
