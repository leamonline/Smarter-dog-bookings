// Every route names itself in the tab (#1004). The title is decided once, in
// src/routing/documentTitle.ts; this proves it reaches the real document.
import { expect, test } from "@playwright/test";

const ROUTES: Array<[string, RegExp]> = [
  ["/staff/today", /^Daily Brief · Smarter Dog$/],
  ["/staff/inbox", /^Inbox · Smarter Dog$/],
  ["/staff/dogs", /^Dogs · Smarter Dog$/],
  ["/staff/humans", /^Humans · Smarter Dog$/],
  ["/reset-password", /^Reset password · Smarter Dog Bookings$/],
  ["/book", / · Smarter Dog Bookings$/],
];

for (const [path, title] of ROUTES) {
  test(`${path} has its own title`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  });
}

test("moving between staff sections updates the title", async ({ page }) => {
  await page.goto("/staff/today");
  await expect(page).toHaveTitle(/^Daily Brief/);
  await page.goto("/staff/dogs");
  await expect(page).toHaveTitle(/^Dogs/);
});
