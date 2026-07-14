import { expect, test, type Locator, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");

function firstJourneyRow(page: Page) {
  return page
    .getByRole("article")
    .filter({ has: page.getByRole("button", { name: "Check-in" }) })
    .first();
}

async function tabTo(page: Page, target: Locator, maxTabs: number) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  await expect(target).toBeFocused();
}

test("Daily Brief keeps its core journey usable at every supported width", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "tablet") {
    await page.setViewportSize({ width: 1024, height: 1366 });
  }
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  await expect(
    page.getByRole("heading", { level: 1, name: "Daily Brief" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/today\?date=2026-07-14/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const firstJourney = firstJourneyRow(page);
  await expect(
    firstJourney.getByRole("button", { name: /Open .*'s dog file/ }),
  ).toBeVisible();
  await expect(
    firstJourney.getByRole("button", { name: "Check-in" }),
  ).toBeVisible();

  await firstJourney
    .getByRole("button", { name: /Open £.* invoice/ })
    .click();
  const invoice = page.getByRole("dialog", { name: /Invoice/ });
  await expect(invoice).toBeVisible();
  await invoice.getByRole("button", { name: "Cancel" }).click();
  await expect(invoice).not.toBeVisible();

  await page.getByRole("button", { name: /Choose date/ }).click();
  const datePicker = page.getByRole("dialog", { name: "July 2026" });
  await datePicker
    .getByRole("button", { name: "Wednesday, 15 July 2026", exact: true })
    .click();
  await expect(page).toHaveURL(/date=2026-07-15/);
  await expect(page.getByText("No bookings on this date")).toBeVisible();
});

test("journey and invoice work by keyboard", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const firstJourney = firstJourneyRow(page);
  const dateButton = page.getByRole("button", { name: /Choose date/ });
  const priceButton = firstJourney.getByRole("button", {
    name: /Open £.* invoice/,
  });

  await dateButton.focus();
  await expect(dateButton).toBeFocused();
  await tabTo(page, priceButton, 12);

  await page.keyboard.press("Enter");
  const invoice = page.getByRole("dialog", { name: /Invoice/ });
  await expect(invoice).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(invoice).not.toBeVisible();
  await expect(priceButton).toBeFocused();

  const checkIn = firstJourney.getByRole("button", { name: "Check-in" });
  await tabTo(page, checkIn, 3);
  await expect(firstJourney.getByText("Check-in", { exact: true })).toHaveCSS(
    "opacity",
    "1",
  );
});
