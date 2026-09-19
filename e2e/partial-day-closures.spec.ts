import { test, expect } from "@playwright/test";

// Partial-day closures, driven through the real staff calendar against offline
// sample data — no Supabase, no customer PII.
//
// The suite runs on real wall-clock dates, so nothing here hardcodes a day.
// Open days carry an ", availability" mini-calendar label; closed ones say
// ", closed", so the first availability button is a stable way to land on a
// day that actually has a slot grid.
test.describe("Partial-day closures", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // "/" lands on the Daily Brief; the weekly calendar with the slot grid is
    // the Bookings route.
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Bookings" })
      .click();
    await page
      .getByRole("button", { name: /, availability$/ })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: /open slot actions/ }).first(),
    ).toBeVisible();
  });

  test("close an hour and a half from a slot, then reopen it", async ({ page }) => {
    await page.getByRole("button", { name: /^9:00 — .*open slot actions/ }).click();
    await page.getByRole("menuitem", { name: "Close from here…" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 09:00 → 10:30 covers 09:00, 09:30 and 10:00. `to` is exclusive.
    await expect(dialog.getByLabel("From")).toHaveValue("09:00");
    await dialog.getByLabel("To").selectOption("10:30");
    await expect(dialog.getByText("3 slots will be closed.")).toBeVisible();

    // The chip fills the reason verbatim, and the preview shows the exact
    // wording the calendar card will carry.
    await dialog.getByRole("button", { name: "late start", exact: true }).click();
    await expect(dialog.getByText("Closed for late start")).toBeVisible();

    await dialog.getByRole("button", { name: "Close these times" }).click();
    await expect(dialog).toBeHidden();

    // ONE card stands in for all three slots.
    await expect(page.getByText("Closed for late start")).toHaveCount(1);
    await expect(page.getByText(/9:00 – 10:30/)).toBeVisible();
    await expect(page.getByText(/3 slots/)).toBeVisible();

    // The covered slots lose their clock menus; everything else is untouched.
    await expect(
      page.getByRole("button", { name: /^9:30 — .*open slot actions/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^10:30 — .*open slot actions/ }),
    ).toBeVisible();

    // Reopening brings the slots straight back.
    await page.getByRole("button", { name: /^Closure actions for/ }).click();
    await page.getByRole("menuitem", { name: "Reopen these times" }).click();

    await expect(page.getByText("Closed for late start")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^9:30 — .*open slot actions/ }),
    ).toBeVisible();
  });

  test("a booking left inside a closure is flagged, not removed", async ({ page }) => {
    // The sample Monday has bookings at 09:00, so closing that half hour has to
    // leave them on screen under a hazard frame rather than hiding them.
    await page.getByRole("button", { name: /^9:00 — .*open slot actions/ }).click();
    await page.getByRole("menuitem", { name: "Close from here…" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("To").selectOption("09:30");
    await dialog.getByRole("button", { name: "doctor's appointment", exact: true }).click();

    // The dialog warns about the clash but still allows the save.
    await expect(dialog.getByText(/sits? in these times/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Close these times" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Closed for doctor's appointment")).toHaveCount(1);
    const flagged = page.getByRole("group", {
      name: "Needs attention: booked during a closure",
    });
    expect(await flagged.count()).toBeGreaterThan(0);
    await expect(flagged.first()).toBeVisible();
  });

  test("close part of the day from the Day settings drawer", async ({ page }) => {
    await page.getByRole("button", { name: "Day settings" }).click();
    await page.getByRole("button", { name: /Close part of the day/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Opened from the drawer, it starts at the first slot of the day.
    await expect(dialog.getByLabel("From")).toHaveValue("08:30");

    await dialog.getByRole("button", { name: "early finish", exact: true }).click();
    await dialog.getByRole("button", { name: "Close these times" }).click();

    await expect(page.getByText("Closed for early finish")).toHaveCount(1);
  });
});
