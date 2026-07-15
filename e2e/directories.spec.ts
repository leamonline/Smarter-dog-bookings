import { expect, type Locator, test } from "@playwright/test";

async function expectBalancedDirectory(card: Locator) {
  await expect(card).toBeVisible();

  const layout = await card.evaluate((element) => {
    const documentWidth = document.documentElement.clientWidth;
    const cardRect = element.getBoundingClientRect();
    const siblingCards = Array.from(element.parentElement?.children ?? [])
      .filter((sibling): sibling is HTMLElement => sibling instanceof HTMLElement)
      .map((sibling) => sibling.getBoundingClientRect())
      .filter((rect) => Math.abs(rect.top - cardRect.top) < 2);

    return {
      cardInsideViewport:
        cardRect.left >= -1 && cardRect.right <= documentWidth + 1,
      noPageOverflow:
        document.documentElement.scrollWidth <= documentWidth + 1 &&
        document.body.scrollWidth <= documentWidth + 1,
      firstRowWidthSpread:
        Math.max(...siblingCards.map(({ width }) => width)) -
        Math.min(...siblingCards.map(({ width }) => width)),
    };
  });

  expect(layout.cardInsideViewport).toBe(true);
  expect(layout.noPageOverflow).toBe(true);
  expect(layout.firstRowWidthSpread).toBeLessThanOrEqual(1);
}

test.describe("Responsive directories", () => {
  test("identity cards remain balanced across directory breakpoints", async ({
    page,
  }) => {
    await page.goto("/humans");

    const initials = page.getByTestId("human-initials").first();
    await expect(initials).toBeVisible();
    await expect(initials).toHaveText(/\S/);

    const humanCard = initials.locator("xpath=ancestor::article[1]");
    await expect(
      humanCard.getByRole("button", { name: /View profile for/i }),
    ).toBeVisible();
    await expectBalancedDirectory(humanCard);

    await page.goto("/dogs");

    const sizeMark = page.getByTestId("dog-size-mark").first();
    await expect(sizeMark).toBeVisible();

    const dogCard = sizeMark.locator("xpath=ancestor::article[1]");
    await expect(
      dogCard.getByText(/^(Small|Medium|Large|Size unknown)$/),
    ).toBeVisible();
    await expect(
      dogCard.getByRole("button", { name: /View profile for/i }),
    ).toBeVisible();
    await expectBalancedDirectory(dogCard);
  });
});
