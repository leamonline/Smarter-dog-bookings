import { expect, test } from "@playwright/test";
import { customer, query, resetDatabase, signIn } from "./support/portal";

test.beforeEach(resetDatabase);

test("a customer books a new appointment and the database holds exactly that booking", async ({ page }) => {
  const sam = customer("sam");
  const biscuit = sam.dogs[0];
  await signIn(page, "sam");

  await page.getByRole("button", { name: "Book a groom" }).first().click();

  // Step 1: dogs.
  await expect(page.getByRole("heading", { name: "Select dogs" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(biscuit.name) }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: service.
  await expect(page.getByRole("heading", { name: "Choose services" })).toBeVisible();
  await page.getByRole("button", { name: /Full Groom/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: date. The salon's open days come from the database, so pick the
  // fourth day the calendar offers rather than a hard-coded date.
  await expect(page.getByRole("heading", { name: "Pick a date" })).toBeVisible();
  const openDays = page.locator("button[aria-label]:not([disabled])").filter({ hasText: /^\d+$/ });
  await expect(openDays.nth(3)).toBeVisible();
  const closedDays = page.locator('button[aria-label$=", closed"]');
  await expect(closedDays.first()).toBeDisabled();
  await openDays.nth(3).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: time.
  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await page.getByRole("button", { name: "9:00am" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: confirm.
  await expect(page.getByRole("heading", { name: "Confirm booking" })).toBeVisible();
  await expect(page.getByText(/at 9:00am/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByRole("heading", { name: "All booked in!" })).toBeVisible({ timeout: 30_000 });

  // The row that was written, not the click that was made.
  const rows = query(
    `select dog_id, slot, status, service, size, extract(isodow from booking_date)::int
       from public.bookings`,
  );
  expect(rows).toHaveLength(1);
  const [dogId, slot, status, service, size, isoDow] = rows[0];
  expect(dogId).toBe(biscuit.id);
  expect(slot).toBe("09:00");
  expect(status).toBe("Booked");
  expect(service).toBe("full-groom");
  expect(size).toBe("small");
  // Monday to Wednesday: the calendar gate's open days.
  expect([1, 2, 3]).toContain(Number(isoDow));
});
