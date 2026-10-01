import { test, expect } from "@playwright/test";

// Partial-day closures, driven through the real staff calendar against offline
// sample data — no Supabase, no customer PII.
//
// The suite runs on real wall-clock dates, so nothing here hardcodes a day.
// It also runs on desktop, tablet, mobile and both folds, and the mini
// calendar with its ", availability" day buttons is a desktop sidebar only —
// so navigation goes through the calendar's ?date= parameter (honoured by
// useWeekNav on first load), which behaves identically on every viewport.

/** The next Monday on or after today — always an open salon day (Mon–Wed). */
function nextOpenDate(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

test.describe("Partial-day closures", () => {
  test.beforeEach(async ({ page }) => {
    // "/staff" is the weekly calendar; "/" redirects to the Daily Brief, which
    // has no slot grid. ?date= is honoured by useWeekNav on first load.
    await page.goto(`/staff?date=${nextOpenDate()}`);
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
