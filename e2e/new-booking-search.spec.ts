import { test, expect } from "@playwright/test";

// Full-stack regression guard for UX-AUDIT-REPORT Top 5 #1: typed search in
// the New Booking modal used to hang on "Searching..." and never return
// results, blocking the primary booking flow. The component-level guards
// live in DogSearchSection.component.test.jsx; this spec exercises the real
// modal against the offline sample dataset end-to-end.
test.describe("New Booking dog search", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Post the staff-bookings redesign (#446) the header "New booking" CTA is
    // desktop-only; on tablet/mobile staff start a booking by tapping a slot.
    // This spec exercises the modal's dog search, which is viewport-independent
    // (the search logic also has full unit coverage in
    // DogSearchSection.component.test.jsx), so we drive it through the desktop
    // header entry rather than re-implementing the per-slot path per viewport.
    test.skip(
      testInfo.project.name !== "desktop",
      "New booking header CTA is desktop-only after redesign #446",
    );
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

    // Scope to the New Booking dialog. The same dog (Luna) is also rendered
    // on the week calendar *behind* the modal, so an unscoped getByText("Luna")
    // matches two elements and trips Playwright strict mode. The search result
    // we care about lives inside the dialog — assert there.
    const dialog = page.getByRole("dialog");

    // The regression: this used to sit on "Searching..." forever.
    await expect(dialog.getByText("Luna")).toBeVisible();
    await expect(dialog.getByText("Emma Wilson")).toBeVisible();
    await expect(dialog.getByText("Searching...")).not.toBeVisible();
  });

  test("a query with no matches resolves to the no-results state", async ({
    page,
  }) => {
    await page.getByPlaceholder(/start typing a dog's name/i).fill("zzzz");

    await expect(
      page.getByText(/can't find anyone with "zzzz"/i),
    ).toBeVisible();
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
