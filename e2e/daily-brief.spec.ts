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

  const pageHeading = page.getByRole("heading", { level: 1, name: "Daily Brief" });
  await expect(pageHeading).toBeAttached();
  await expect(pageHeading).toHaveClass(/sr-only/);
  await expect(page).toHaveURL(/\/today\?date=2026-07-14/);
  const dateControl = page.getByRole("button", {
    name: "Choose date, Tuesday 14 July",
  });
  await expect(dateControl).toBeVisible();
  expect(
    await dateControl.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        borderWidth: styles.borderWidth,
        color: styles.color,
        justifyContent: styles.justifyContent,
        fillsParent: element.getBoundingClientRect().width ===
          element.parentElement?.getBoundingClientRect().width,
      };
    }),
  ).toEqual({
    backgroundColor: "rgb(254, 204, 19)",
    borderColor: "rgb(254, 204, 19)",
    borderWidth: "2px",
    color: "rgb(0, 0, 0)",
    justifyContent: "center",
    fillsParent: true,
  });

  const availability = page.getByRole("button", { name: "Manage availability" });
  const noSlots = page.getByText("No online slots available");
  await expect(availability).toBeVisible();
  await expect(noSlots).toBeVisible();
  await expect(availability).toHaveCSS("justify-content", "center");
  await expect(noSlots).toHaveCSS("text-align", "center");
  expect(
    await availability.evaluate(
      (element) => {
        const parent = element.parentElement;
        if (!parent) return false;
        const parentStyles = getComputedStyle(parent);
        const contentWidth =
          parent.clientWidth -
          Number.parseFloat(parentStyles.paddingLeft) -
          Number.parseFloat(parentStyles.paddingRight);
        return Math.abs(element.getBoundingClientRect().width - contentWidth) < 1;
      },
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Humans — 7 new customers awaiting approval" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inbox — 12 to reply" }),
  ).toBeVisible();
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

  const firstJourney = firstJourneyRow(page);
  await expect(
    firstJourney.getByRole("button", { name: /Open .*'s dog file/ }),
  ).toBeVisible();
  await expect(
    firstJourney.getByRole("button", { name: "Check-in" }),
  ).toBeVisible();
  const journeyRows = page.getByRole("article").filter({
    has: page.getByTestId("booking-journey-grid"),
  });
  const rowCount = await journeyRows.count();
  expect(rowCount).toBeGreaterThan(1);
  for (let index = 0; index < rowCount; index += 1) {
    const row = journeyRows.nth(index);
    const time = row.getByRole("button", { name: /Open \d{2}:\d{2} booking/ });
    const message = row.locator(
      'button[aria-label^="Message "]:not([data-testid="journey-action"])',
    );
    await expect(time).toHaveCSS("width", "44px");
    await expect(time).toHaveCSS("height", "44px");
    await expect(time).toHaveCSS("background-color", "rgb(255, 76, 56)");
    await expect(message).toHaveCSS("width", "44px");
    await expect(message).toHaveCSS("height", "44px");
    await expect(message).toHaveCSS("background-color", "rgb(91, 209, 0)");
    const actionCount = await row.getByTestId("journey-action").count();
    await expect(row.getByRole("checkbox")).toHaveCount(actionCount);
  }

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
