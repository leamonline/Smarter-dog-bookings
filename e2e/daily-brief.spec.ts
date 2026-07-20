import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");

function bookingCard(page: Page, dogName: string) {
  return page.getByRole("article", { name: new RegExp(`^${dogName},`) });
}

test("Daily Brief keeps the status board usable at every supported width", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "tablet") {
    await page.setViewportSize({ width: 1024, height: 1366 });
  }
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const pageHeading = page.getByRole("heading", { level: 1, name: "Daily Brief" });
  await expect(pageHeading).toBeAttached();
  await expect(pageHeading).toHaveClass(/sr-only/);
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const dateControl = page.getByRole("button", {
    name: "Choose date, Monday 13 July",
  });
  await expect(dateControl).toBeVisible();
  const availability = page.getByRole("button", { name: "Manage availability" });
  await expect(availability).toBeVisible();
  expect(
    await page.evaluate(() => ({
      documentFits:
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      bodyFits: document.body.scrollWidth <= document.body.clientWidth,
    })),
  ).toEqual({ documentFits: true, bodyFits: true });
  if (testInfo.project.name === "tablet") {
    const account = page.getByRole("button", { name: "Account menu" });
    await expect(account).toBeVisible();
    expect(
      await account.evaluate((element) => element.getBoundingClientRect().right),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }

  const dueLane = page.getByRole("region", { name: "Arriving, 2 dogs" });
  const withUsLane = page.getByRole("region", { name: "With us, 2 dogs" });
  const readyLane = page.getByRole("region", { name: "Ready to go, 1 dog" });
  const home = page.getByRole("region", { name: "Home on this date, 1 dog" });
  await expect(dueLane).toBeVisible();
  await expect(withUsLane).toBeVisible();
  await expect(readyLane).toBeVisible();
  await expect(home).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByTestId("booking-journey-grid")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "status fixed" })).toBeVisible();

  const maxCard = bookingCard(page, "Max");
  const bellaCard = bookingCard(page, "Bella");
  const charlieCard = bookingCard(page, "Charlie");
  const lunaCard = bookingCard(page, "Luna");
  await expect(maxCard.getByRole("button", { name: "Open Max's dog file" })).toBeVisible();
  await expect(maxCard.getByRole("button", { name: "Open Dave Smith's human file" })).toBeVisible();
  await expect(maxCard.getByRole("button", { name: "Check in Max" })).toBeVisible();
  await expect(bellaCard.getByRole("button", { name: "Start Bella's groom" })).toBeVisible();
  await expect(charlieCard.getByRole("button", { name: "Mark Charlie ready for collection" })).toBeVisible();
  await expect(lunaCard.getByRole("button", { name: "Mark Luna collected" })).toBeVisible();

  for (const action of [
    maxCard.getByRole("button", { name: "Check in Max" }),
    bellaCard.getByRole("button", { name: "Start Bella's groom" }),
    charlieCard.getByRole("button", { name: "Mark Charlie ready for collection" }),
    lunaCard.getByRole("button", { name: "Mark Luna collected" }),
  ]) {
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  const activeLaneColumns = await dueLane.locator("..").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(activeLaneColumns).toBe(testInfo.project.name === "desktop" ? 3 : testInfo.project.name === "tablet" ? 2 : 1);

  const dueLaneBody = dueLane.locator('[data-testid="due-lane-body"]');
  const dueLaneBodyCount = await dueLaneBody.count();
  expect(dueLaneBodyCount).toBe(1);
  const laneOverflow = await dueLaneBody.evaluate((element) => getComputedStyle(element).overflowY);
  expect(laneOverflow).toBe(testInfo.project.name === "desktop" ? "auto" : "visible");
  if (testInfo.project.name === "desktop") {
    expect(await dueLane.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(
      Math.round((await page.evaluate(() => window.innerHeight)) * 0.59) + 2,
    );
  }

  await page.getByRole("button", { name: /Choose date/ }).click();
  const datePicker = page.getByRole("dialog", { name: "July 2026" });
  await datePicker
    .getByRole("button", { name: "Wednesday, 15 July 2026", exact: true })
    .click();
  await expect(page).toHaveURL(/date=2026-07-15/);
  await expect(page.getByText("No bookings on this date")).toBeVisible();
});

test("status actions and invoice work by keyboard", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const ready = bookingCard(page, "Charlie").getByRole("button", {
    name: "Mark Charlie ready for collection",
  });
  await ready.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();

  const priceButton = bookingCard(page, "Charlie").getByRole("button", {
    name: /Take £.* from Charlie/,
  });
  await priceButton.focus();
  await page.keyboard.press("Enter");
  const invoice = page.getByRole("dialog", { name: /Invoice/ });
  await expect(invoice).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(invoice).not.toBeVisible();
  await expect(priceButton).toBeFocused();
});

test("live arrival follows the focused dog without a duplicate Now panel", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const liveMarker = page.getByLabel(/due now|due to arrive|overdue/i).first();
  await expect(liveMarker).toBeVisible();
  await expect(page.getByRole("region", { name: "Happening now" })).toHaveCount(0);
  await expect(page.getByTestId("live-arrival-divider")).toHaveCount(1);
  await expect(bookingCard(page, "Coco")).toContainText("45 mins late");

  await bookingCard(page, "Coco").getByRole("button", { name: "Check in Coco" }).click();
  await expect(page.getByRole("region", { name: "Arriving, 2 dogs" })).toContainText("Teddy");
  await expect(page.getByRole("region", { name: "With us, 1 dog" })).toContainText("Coco");
  await expect(page.getByTestId("live-arrival-divider")).toHaveCount(1);
  await expect(page.getByLabel("Teddy — 15 mins overdue")).toBeVisible();
});

test("early morning keeps every booked arrival upcoming", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-07-14T06:30:00+01:00"));
  await page.goto("/today?date=2026-07-14");

  const arriving = page.getByRole("region", { name: "Arriving, 3 dogs" });
  await expect(arriving.getByText("Upcoming")).toHaveCount(3);
  await expect(arriving.locator('[data-action-reason="late"]')).toHaveCount(0);
});

test("unknown-status warning opens the affected booking directly", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const warning = page.getByRole("alert").filter({ hasText: "status fixed" });
  await expect(warning).toContainText("Milo");
  await expect(warning).toContainText("10:00");
  const fixBooking = warning.getByRole("button", { name: "Fix Milo's 10:00 booking" });
  await expect(fixBooking).toBeVisible();
  await fixBooking.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Milo/i })).toBeVisible();
});

test("Need action exposes its selected state and visible row reasons by keyboard", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const filter = page.getByRole("button", { name: /Filter .* bookings needing action/ });
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await filter.focus();
  await page.keyboard.press("Enter");
  const selectedFilter = page.getByRole("button", { name: /Show all bookings/ });
  await expect(selectedFilter).toHaveAttribute("aria-pressed", "true");
  await expect(selectedFilter).toHaveAttribute("data-filter-selected", "true");
  await expect(selectedFilter).toContainText("Filtering");
  await expect(page.getByRole("status")).toContainText("Showing");

  const visibleActionCards = page.locator('[data-needs-action="true"]:visible');
  const actionCardCount = await visibleActionCards.count();
  expect(actionCardCount).toBeGreaterThan(0);
  const missingReasons = await page.locator(
    '[data-needs-action="true"]:visible:not(:has([data-action-reason]))',
  ).count();
  expect(missingReasons).toBe(0);
});

test("dog and human files preserve the selected Daily Brief and restore focus", async ({
  page,
}) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const dogTrigger = page.getByRole("button", { name: "Open Bella's dog file" });
  await dogTrigger.click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const dogDialog = page.getByRole("dialog", { name: /Bella/i });
  await expect(dogDialog).toBeVisible();
  await dogDialog.getByRole("button", { name: "Close" }).click();
  await expect(dogTrigger).toBeFocused();

  const humanTrigger = page.getByRole("button", {
    name: "Open Sarah Jones's human file",
  });
  await humanTrigger.click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const humanDialog = page.getByRole("dialog", { name: /Sarah Jones/i });
  await expect(humanDialog).toBeVisible();
  await humanDialog.getByRole("button", { name: "Close" }).click();
  await expect(humanTrigger).toBeFocused();
});
