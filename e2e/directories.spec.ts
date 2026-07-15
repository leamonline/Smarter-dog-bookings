import { expect, type Locator, test } from "@playwright/test";

async function expectBalancedDirectory(cards: Locator, projectName: string) {
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(projectName === "mobile" ? 1 : 2);

  const card = cards.first();
  await expect(card).toBeVisible();

  const layout = await cards.evaluateAll((elements) => {
    const documentWidth = document.documentElement.clientWidth;
    const cardRect = elements[0].getBoundingClientRect();
    const parentRect = elements[0].parentElement?.getBoundingClientRect();
    const firstRowCards = elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => Math.abs(rect.top - cardRect.top) < 2);

    return {
      cardInsideViewport:
        cardRect.left >= -1 && cardRect.right <= documentWidth + 1,
      noPageOverflow:
        document.documentElement.scrollWidth <= documentWidth + 1 &&
        document.body.scrollWidth <= documentWidth + 1,
      cardFillsParent:
        parentRect !== undefined &&
        Math.abs(cardRect.left - parentRect.left) <= 1 &&
        Math.abs(cardRect.right - parentRect.right) <= 1,
      firstRowCardCount: firstRowCards.length,
      firstRowWidthSpread:
        Math.max(...firstRowCards.map(({ width }) => width)) -
        Math.min(...firstRowCards.map(({ width }) => width)),
    };
  });

  expect(layout.cardInsideViewport).toBe(true);
  expect(layout.noPageOverflow).toBe(true);
  if (projectName === "mobile") {
    expect(layout.cardFillsParent).toBe(true);
  } else {
    expect(layout.firstRowCardCount).toBeGreaterThanOrEqual(2);
    expect(layout.firstRowWidthSpread).toBeLessThanOrEqual(1);
  }
}

test.describe("Responsive directories", () => {
  test("identity cards remain balanced across directory breakpoints", async ({
    page,
  }, testInfo) => {
    await page.goto("/humans");

    const humanCards = page.locator("article").filter({
      has: page.getByTestId("human-initials"),
    });
    const initials = humanCards.first().getByTestId("human-initials");
    await expect(initials).toBeVisible();
    await expect(initials).toHaveText(/\S/);

    const humanCard = humanCards.first();
    await expect(
      humanCard.getByRole("button", { name: /View profile for/i }),
    ).toBeVisible();
    await expectBalancedDirectory(humanCards, testInfo.project.name);

    await page.goto("/dogs");

    const dogCards = page.locator("article").filter({
      has: page.getByTestId("dog-size-mark"),
    });
    const sizeMark = dogCards.first().getByTestId("dog-size-mark");
    await expect(sizeMark).toBeVisible();
    const silhouette = sizeMark.locator(".dog-size-mark__silhouette");
    await expect(silhouette).toBeVisible();
    const silhouetteBox = await silhouette.boundingBox();
    expect(silhouetteBox).not.toBeNull();
    expect(silhouetteBox?.width).toBeGreaterThan(0);
    expect(silhouetteBox?.height).toBeGreaterThan(0);

    const dogCard = dogCards.first();
    await expect(
      dogCard.getByText(/^(Small|Medium|Large|Size unknown)$/),
    ).toBeVisible();
    await expect(
      dogCard.getByRole("button", { name: /View profile for/i }),
    ).toBeVisible();
    await expectBalancedDirectory(dogCards, testInfo.project.name);
  });
});
