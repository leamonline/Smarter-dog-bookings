import { test, expect } from "@playwright/test";

// Full-stack regression guard for UX-AUDIT-REPORT Top 5 #1: typed search in
// the New Booking modal used to hang on "Searching..." and never return
// results, blocking the primary booking flow. The component-level guards
// live in DogSearchSection.component.test.jsx; this spec exercises the real
// modal against the offline sample dataset end-to-end.
test.describe("New Booking dog search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: /new booking/i })
      .first()
      .click();
    await expect(
      page.getByPlaceholder(/start typing a dog's name/i),
    ).toBeVisible();
  });

  test("typing a dog's name returns the matching dog and owner", async ({
    page,
  }) => {
    await page.getByPlaceholder(/start typing a dog's name/i).fill("lun");

    // The regression: this used to sit on "Searching..." forever.
    await expect(page.getByText("Luna")).toBeVisible();
    await expect(page.getByText("Emma Wilson")).toBeVisible();
    await expect(page.getByText("Searching...")).not.toBeVisible();
  });

  test("a query with no matches resolves to the no-results state", async ({
    page,
  }) => {
    await page.getByPlaceholder(/start typing a dog's name/i).fill("zzzz");

    await expect(page.getByText(/no dogs found matching "zzzz"/i)).toBeVisible();
    await expect(page.getByText("Searching...")).not.toBeVisible();
  });

  test("selecting a search result attaches the dog to the booking", async ({
    page,
  }) => {
    await page.getByPlaceholder(/start typing a dog's name/i).fill("bel");
    // mousedown is what the dropdown rows listen for (blur-safe selection).
    await page.getByRole("button", { name: /book bella/i }).first().dispatchEvent("mousedown");

    // The picked dog renders as a card with its inline service selector.
    await expect(page.getByText("Cockapoo", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add another dog" })).toBeVisible();
  });
});
