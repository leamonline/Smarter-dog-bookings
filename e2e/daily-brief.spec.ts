import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");

function bookingCard(page: Page, dogName: string) {
  return page.getByRole("article", { name: new RegExp(`^${dogName},`) });
}

function goldPrimaries(page: Page) {
  return page.locator('[data-status-board-root] [data-primary-action="true"].bg-brand-yellow');
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

  // One header anatomy at every width: the date IS the date-picker control,
  // and the availability button carries its own state as a sub-label.
  const dateControl = page.getByRole("button", {
    name: "Monday 13 July — choose a different date",
  });
  await expect(dateControl).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose date, Monday 13 July" })).toHaveCount(0);
  const availability = page.getByRole("button", { name: /Manage availability/ });
  await expect(availability).toBeVisible();
  expect((await availability.boundingBox())?.height).toBeGreaterThanOrEqual(44);

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
  await expect(dueLane).toBeVisible();
  await expect(withUsLane).toBeVisible();
  await expect(readyLane).toBeVisible();

  // The sent-home list lives in the end-of-day strip behind one disclosure.
  const home = page.getByRole("group", { name: "Home on this date, 1 dog" });
  await expect(home).toBeVisible();
  const homeToggle = home.getByRole("button", { name: "Show 1 dog sent home" });
  await expect(homeToggle).toHaveAttribute("aria-expanded", "false");
  await expect(home.getByRole("list")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "status fixed" })).toBeVisible();

  const maxCard = bookingCard(page, "Max");
  const bellaCard = bookingCard(page, "Bella");
  const charlieCard = bookingCard(page, "Charlie");
  const lunaCard = bookingCard(page, "Luna");
  // The card body opens the booking; dog/human names are calm text and their
  // files live one tap away in More.
  await expect(maxCard.getByRole("button", { name: "Open Max's 08:30 booking" })).toBeAttached();
  await expect(maxCard.getByRole("button", { name: "Open Max's dog file" })).toHaveCount(0);
  await maxCard.getByRole("button", { name: "More actions for Max" }).click();
  await expect(page.getByRole("menuitem", { name: "Open Max's dog file" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Open Dave Smith's human file" })).toBeVisible();
  await page.keyboard.press("Escape");

  for (const action of [
    maxCard.getByRole("button", { name: "Check in Max" }),
    bellaCard.getByRole("button", { name: "Start Bella's groom" }),
    charlieCard.getByRole("button", { name: "Mark Charlie ready for collection" }),
    lunaCard.getByRole("button", { name: "Mark Luna collected" }),
  ]) {
    expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  // A browsed non-today date fills no gold primary — nothing on it is
  // happening now.
  await expect(goldPrimaries(page)).toHaveCount(0);

  const activeLaneColumns = await dueLane.locator("..").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(activeLaneColumns).toBe(testInfo.project.name === "desktop" ? 3 : testInfo.project.name === "tablet" ? 2 : 1);

  // One page scroll only — no lane ever scrolls inside itself.
  const dueLaneBody = dueLane.locator('[data-testid="due-lane-body"]');
  await expect(dueLaneBody).toHaveCount(1);
  expect(await dueLaneBody.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");

  await dateControl.click();
  const datePicker = page.getByRole("dialog", { name: "July 2026" });
  await datePicker
    .getByRole("button", { name: /^Wednesday 15 July 2026/ })
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

  // Charlie still owes a balance, so Take payment is now the Ready card's
  // primary action rather than sitting inside More.
  const priceButton = bookingCard(page, "Charlie").getByRole("button", {
    name: /Take £.* payment from Charlie/,
  });
  await priceButton.focus();
  await page.keyboard.press("Enter");
  const invoice = page.getByRole("dialog", { name: /Invoice/ });
  await expect(invoice).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(invoice).not.toBeVisible();
});

test("mini invoice fits without scrolling at every supported viewport", async ({
  page,
}, testInfo) => {
  const viewport =
    testInfo.project.name === "mobile"
      ? { width: 320, height: 568 }
      : testInfo.project.name === "tablet"
        ? { width: 768, height: 1024 }
        : { width: 1280, height: 640 };

  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const charlieCard = bookingCard(page, "Charlie");
  await charlieCard
    .getByRole("button", { name: "Mark Charlie ready for collection" })
    .click();
  await page.getByRole("button", { name: "Not now" }).click();
  await charlieCard.getByRole("button", { name: /Take £.* payment from Charlie/ }).click();

  const invoice = page.getByRole("dialog", { name: "Invoice · Charlie" });
  const invoiceBody = invoice.locator(".mini-invoice-body");
  await expect(invoice).toBeVisible();
  await expect(invoiceBody).toBeVisible();
  await expect(invoice.getByRole("button", { name: "Save payment" })).toBeInViewport();
  await expect
    .poll(() => invoice.evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(viewport.height + 1);

  const geometry = await invoice.evaluate((element) => {
    const body = element.querySelector(".mini-invoice-body");
    const bounds = element.getBoundingClientRect();
    if (!(body instanceof HTMLElement)) throw new Error("Mini invoice body missing");
    return {
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bottom: bounds.bottom,
      top: bounds.top,
    };
  });

  expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(geometry.bodyClientHeight + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(viewport.height + 1);

  await invoice.getByRole("button", { name: "Save payment" }).click();
  await expect(invoice.getByRole("alert")).toContainText(
    "Choose Cash, Card or Bank transfer",
  );
  await expect
    .poll(() =>
      invoiceBody.evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() => invoice.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(0);
});

test("the header Next link and the single gold primary follow the focused dog", async ({ page }, testInfo) => {
  const hasNextLink = testInfo.project.name !== "mobile"; // the link is md+ — on phones the ordered column carries it
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  // No duplicated Now panel and no auto-scroll divider — the header names the
  // next dog, the board marks it with the page's only gold primary.
  await expect(page.getByRole("region", { name: "Happening now" })).toHaveCount(0);
  await expect(page.getByTestId("live-arrival-divider")).toHaveCount(0);
  await expect(page.getByText("Next arrival")).toHaveCount(0);

  await expect(goldPrimaries(page)).toHaveCount(1);
  await expect(goldPrimaries(page).first()).toHaveAccessibleName("Check in Coco");

  // Coco's lateness is on its shared slot heading, not repeated inside the
  // card itself — and a late arrival always offers Message (Call additionally
  // appears only with a resolvable phone number, which this record doesn't have).
  const dueLane = page.getByRole("region", { name: "Arriving, 3 dogs" });
  await expect(dueLane).toContainText("45 min late");
  await expect(bookingCard(page, "Coco")).not.toContainText("45 min late");
  await expect(bookingCard(page, "Coco").getByRole("button", { name: /^Message / })).toBeVisible();

  // The Next link jumps to the focused card on request (md and up).
  if (hasNextLink) {
    const nextLink = page.getByRole("button", { name: "Next: Coco — 45 min overdue" });
    await expect(nextLink).toBeVisible();
    await nextLink.click();
    await expect(bookingCard(page, "Coco")).toBeFocused();
  }

  await bookingCard(page, "Coco").getByRole("button", { name: "Check in Coco" }).click();
  await expect(page.getByRole("region", { name: "Arriving, 2 dogs" })).toContainText("Teddy");
  await expect(page.getByRole("region", { name: "With us, 1 dog" })).toContainText("Coco");
  // The focus advances: the gold primary and the Next link both move to Teddy.
  await expect(goldPrimaries(page)).toHaveCount(1);
  await expect(goldPrimaries(page).first()).toHaveAccessibleName("Check in Teddy");
  if (hasNextLink) {
    await expect(page.getByRole("button", { name: "Next: Teddy — 15 min overdue" })).toBeVisible();
  }
});

test("early morning keeps every booked arrival upcoming — and nothing gold", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-07-14T06:30:00+01:00"));
  await page.goto("/today?date=2026-07-14");

  const arriving = page.getByRole("region", { name: "Arriving, 3 dogs" });
  await expect(arriving.getByText("Upcoming", { exact: true })).toHaveCount(0);
  await expect(arriving.getByRole("article")).toHaveCount(3);
  await expect(arriving.locator('[data-action-reason="late"]')).toHaveCount(0);
  // Yellow means "do this now" — at 6:30 nothing is, so nothing is yellow,
  // and the empty downstream lanes fold into one reassurance line.
  await expect(goldPrimaries(page)).toHaveCount(0);
  await expect(page.getByText("With us — nobody yet")).toBeVisible();
});

test("staff confirm an unconfirmed arrival from its card and the flag clears", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  // Poppy's reminder went out unanswered: the card chases, quietly.
  const poppyCard = bookingCard(page, "Poppy");
  await expect(poppyCard.getByText("Needs confirmation")).toBeVisible();
  const confirm = poppyCard.getByRole("button", { name: "Confirm Poppy's booking" });
  await expect(confirm).toBeVisible();
  expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  // The owner confirmed by phone — staff record it on the spot.
  await confirm.click();
  await expect(page.getByText("Poppy's booking confirmed")).toBeVisible();
  await expect(poppyCard.getByText("Needs confirmation")).toHaveCount(0);
  await expect(poppyCard.getByRole("button", { name: "Confirm Poppy's booking" })).toHaveCount(0);
  // The tick says WHO confirmed — staff, not the customer.
  await expect(poppyCard.getByRole("img", { name: "Confirmed by staff at 09:15" })).toBeVisible();
  // A booking the customer already answered has nothing left to confirm.
  await expect(page.getByText(/to confirm/)).toHaveCount(0);
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

test("the itemised filter exposes its selected state and visible row reasons by keyboard", async ({ page }) => {
  // This test is about the filter's data flow, not responsive layout — pin
  // to a width where the desktop status sentence is in the accessibility tree.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const filter = page.getByRole("button", { name: /Filter to the .* needing attention/ });
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await expect(filter).toContainText(/\d+ late/);
  await filter.focus();
  await page.keyboard.press("Enter");
  const selectedFilter = page.getByRole("button", { name: /Show all bookings/ });
  await expect(selectedFilter).toHaveAttribute("aria-pressed", "true");
  await expect(selectedFilter).toHaveAttribute("data-filter-selected", "true");
  await expect(selectedFilter).toContainText("Clear");
  await expect(page.getByText(/Showing .* needing attention/)).toBeVisible();

  const visibleActionCards = page.locator('[data-needs-action="true"]:visible');
  const actionCardCount = await visibleActionCards.count();
  expect(actionCardCount).toBeGreaterThan(0);
  const missingReasons = await page.locator(
    '[data-needs-action="true"]:visible:not(:has([data-action-reason]))',
  ).count();
  expect(missingReasons).toBe(0);
});

test("dog and human files open from More, preserve the date and restore focus", async ({
  page,
}) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const moreTrigger = bookingCard(page, "Bella").getByRole("button", { name: "More actions for Bella" });
  await moreTrigger.click();
  await page.getByRole("menuitem", { name: "Open Bella's dog file" }).click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const dogDialog = page.getByRole("dialog", { name: /Bella/i });
  await expect(dogDialog).toBeVisible();
  await dogDialog.getByRole("button", { name: "Close" }).click();
  await expect(moreTrigger).toBeFocused();

  await moreTrigger.click();
  await page.getByRole("menuitem", { name: "Open Sarah Jones's human file" }).click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const humanDialog = page.getByRole("dialog", { name: /Sarah Jones/i });
  await expect(humanDialog).toBeVisible();
  await humanDialog.getByRole("button", { name: "Close" }).click();
  await expect(moreTrigger).toBeFocused();
});

test("the More menu is never clipped by the board and dismisses on scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 560 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const triggers = page
    .locator('[data-testid="due-lane-body"]')
    .getByRole("button", { name: /More actions for/ });
  await triggers.last().click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);

  // The trigger sits at the bottom of the page here, so scroll back up —
  // any real scroll must dismiss the menu. The dismiss listener deliberately
  // arms a beat after open (so the opening tap's own scroll can't close it);
  // wait past that arming window before scrolling.
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollBy(0, -120));
  await expect(menu).toHaveCount(0);
});

test("compact widths keep one header anatomy: date-as-picker and the itemised filter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const dateControl = page.getByRole("button", {
    name: "Monday 13 July — choose a different date",
  });
  await expect(dateControl).toBeVisible();
  await dateControl.click();
  await expect(page.getByRole("dialog", { name: "July 2026" })).toBeVisible();
  await page.keyboard.press("Escape");

  const availability = page.getByRole("button", { name: /Manage availability/ });
  await expect(availability).toBeVisible();
  const box = await availability.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  const filter = page.getByRole("button", { name: /Filter to the .* needing attention/ });
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await filter.click();
  await expect(page.getByRole("button", { name: /^Show all bookings/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});
