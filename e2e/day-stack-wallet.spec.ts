// The wallet geometry, proven in a real browser: every card the same height,
// overlapped so exactly a 72px strip shows, the last card in full; a tapped
// card lifts to the top of what is visible with a labelled way back below it;
// and every way of putting it back restores the scroll position.
import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");
const MONDAY = "/today?date=2026-07-13";

async function open(page: Page, path = "/today") {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(path);
  await page.locator("[data-day-stack]").waitFor();
}
async function geometry(page: Page) {
  return page.locator("[data-stack-card]").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
  }));
}
async function touch(page: Page, type: string, y = 0) {
  await page.locator("[data-stack-head]").first().dispatchEvent(type, {
    touches: type === "touchend" || type === "touchcancel" ? [] : [{ identifier: 1, clientX: 100, clientY: y }],
    cancelable: true,
  });
}
/** Wait for every card to stop moving. */
async function settled(page: Page) {
  await page.locator("[data-stack-card]").evaluateAll((nodes) => Promise.all(
    nodes.flatMap((node) => node.getAnimations().map((animation) => animation.finished)),
  ));
}

test("every card is the same height, overlapped by exactly a 72px strip, and the last shows in full", async ({ page }) => {
  await open(page, MONDAY);
  const cards = await geometry(page);
  // Transformed rectangles can differ by ~0.00002px on high-DPI tablets.
  for (const card of cards) expect(card.height).toBeCloseTo(128, 3);
  for (let i = 1; i < cards.length; i += 1) {
    expect(cards[i].top - cards[i - 1].top).toBeCloseTo(72, 0);
  }
  // The last card is not covered by anything: its bottom edge is its own.
  const last = page.locator("[data-stack-card]").last();
  await last.scrollIntoViewIfNeeded();
  expect(await last.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(r.left + 24, r.bottom - 6));
  })).toBe(true);
});

test("nothing in any strip is covered by the card on top of it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, MONDAY);
  // Hit-test the end of each strip's second line — the breed line used to sit
  // on the first pixel the next card covered.
  const covered = await page.locator("[data-stack-head] .wallet-line-2").evaluateAll((nodes) => nodes
    .filter((node) => {
      node.scrollIntoView({ block: "center" });
      const card = node.closest("[data-stack-card]");
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return !card!.contains(hit);
    })
    .map((node) => node.closest("[data-stack-card]")!.getAttribute("data-booking-id")));
  expect(covered).toEqual([]);
});

test("a lifted card goes to the top of the screen, the way back stays beside it, and closing restores the scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, MONDAY);
  const main = page.locator("main");
  const last = page.locator("[data-stack-card]").last();
  await last.locator("[data-stack-head]").scrollIntoViewIfNeeded();
  const before = await main.evaluate((node) => node.scrollTop);

  await last.locator("[data-stack-head]").click();
  await settled(page);
  const scrollport = (await main.boundingBox())!;
  const lifted = (await last.boundingBox())!;
  expect(lifted.y).toBeGreaterThanOrEqual(scrollport.y);
  expect(lifted.y).toBeLessThan(scrollport.y + 40);

  // The return control covers the clipped edges and stays with the open card.
  const pile = page.getByRole("button", { name: /^Back to the day/ });
  await expect(pile.getByText("Back to the day")).toBeVisible();
  const pileBox = (await pile.boundingBox())!;
  expect(pileBox.y - (lifted.y + lifted.height)).toBeGreaterThanOrEqual(11);
  expect(pileBox.y - (lifted.y + lifted.height)).toBeLessThanOrEqual(24);
  for (const card of await page.locator("[data-in-pile='true']").all()) {
    expect(await card.evaluate((node) => getComputedStyle(node).clipPath)).toMatch(/inset/);
  }

  await pile.click();
  await settled(page);
  await expect(page.locator("[data-in-pile='true']")).toHaveCount(0);
  expect(await main.evaluate((node) => node.scrollTop)).toBeCloseTo(before, 0);
  await expect(last.locator("[data-stack-head]")).toBeFocused();
});

test("the browser's Back button puts the card back and leaves the page where it was", async ({ page }) => {
  await open(page, MONDAY);
  const url = page.url();
  const card = page.locator("[data-stack-card]").nth(1);
  await card.locator("[data-stack-head]").click();
  await expect(card).toHaveAttribute("data-lifted", "true");
  await page.goBack();
  await expect(card).toHaveAttribute("data-lifted", "false");
  expect(page.url()).toBe(url);
  await expect(page.locator("[data-day-stack]")).toBeVisible();
});

test("a tall phone keeps the labelled return control next to a short card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await open(page);
  const card = page.locator("[data-stack-card]").last();
  await card.locator("[data-stack-head]").click();
  await settled(page);
  const lifted = (await card.boundingBox())!;
  const pile = page.getByRole("button", { name: /^Back to the day/ });
  const box = (await pile.boundingBox())!;
  expect(box.y - (lifted.y + lifted.height)).toBeGreaterThanOrEqual(11);
  expect(box.y - (lifted.y + lifted.height)).toBeLessThanOrEqual(24);
  await expect(pile.getByText("Back to the day")).toBeVisible();
  await pile.click();
  await expect(card).toHaveAttribute("data-lifted", "false");
  await expect(card.locator("[data-stack-head]")).toBeFocused();
});

test("closing with the Close button steps back over the history entry the lift made", async ({ page }) => {
  await open(page, MONDAY);
  const length = await page.evaluate(() => window.history.length);
  const card = page.locator("[data-stack-card]").nth(1);
  await card.locator("[data-stack-head]").click();
  await card.getByRole("button", { name: /^Close / }).click();
  await expect(card).toHaveAttribute("data-lifted", "false");
  // A Back press now leaves /today rather than reopening a card.
  expect(await page.evaluate(() => window.history.state?.dayStackLifted)).toBeFalsy();
  expect(await page.evaluate(() => window.history.length)).toBe(length + 1);
});

for (const when of ["at once", "once the inbox has loaded"]) test(`leaving from a lifted card and pressing Back ${when} returns to that card, and the next Back closes it`, async ({ page }) => {
  await open(page);
  const teddy = page.locator("[data-stack-card]").filter({ hasText: "Teddy" }).first();
  await teddy.locator("[data-stack-head]").click();
  await expect(teddy).toHaveAttribute("data-lifted", "true");

  // WhatsApp the owner: the app moves on to the inbox. A navigation is a
  // transition, so /today can still be mounted for a moment ("at once"); the
  // other run waits until it has gone and the stack must rebuild the lift.
  await teddy.getByRole("button", { name: "WhatsApp Rik — Teddy" }).click();
  await expect(page).toHaveURL(/\/inbox\?human=h10/);
  if (when !== "at once") await expect(page.locator("[data-day-stack]")).toHaveCount(0);

  // Back is not a dead press: it lands on Teddy's card, still lifted.
  await page.goBack();
  await page.locator("[data-day-stack]").waitFor();
  const back = page.locator("[data-stack-card]").filter({ hasText: "Teddy" }).first();
  await expect(back).toHaveAttribute("data-lifted", "true");

  // And the next Back closes it, on the same page.
  await page.goBack();
  await expect(back).toHaveAttribute("data-lifted", "false");
  await expect(page).toHaveURL(/\/today/);
});

test("pull distance separates actual cards and cancellation restores the stack", async ({ page }) => {
  await open(page);
  const initial = await geometry(page);
  await touch(page, "touchstart");
  await touch(page, "touchmove", 60);
  const half = await geometry(page);
  expect(half[2].top - half[1].top).toBeGreaterThan(initial[2].top - initial[1].top);
  await touch(page, "touchmove", 140);
  const full = await geometry(page);
  expect(full[2].top - full[1].top).toBeGreaterThan(half[2].top - half[1].top);
  expect(full[2].top).toBeGreaterThan(full[1].bottom);
  await expect(page.getByText("Release to refresh")).toBeVisible();
  await touch(page, "touchcancel");
  await expect.poll(async () => {
    const rows = await geometry(page); return rows[2].top - rows[1].top;
  }).toBeCloseTo(72, 0);
  await expect(page.locator("[data-refresh-indicator]")).toHaveCount(0);
});

test("scrolling down the day does not start refresh, and reduced motion switches state with no lift animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, MONDAY);
  await page.locator("main").evaluate((node) => { node.scrollTop = 160; });
  await touch(page, "touchstart"); await touch(page, "touchmove", 180); await touch(page, "touchend");
  await expect(page.locator("[data-refresh-indicator]")).toHaveCount(0);
  await expect(page.locator("[data-day-stack]")).toHaveAttribute("data-motion", "reduced");
  const first = page.locator("[data-stack-card]").first();
  expect(await first.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  await page.locator("[data-stack-head]").last().click();
  await expect(page.locator("[data-stack-head]").last()).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-in-pile='true']").first()).toBeAttached();
});

test("a covered card still shows how late, how long or how soon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const timings = page.locator("[data-stack-card] [data-stack-timing]");
  expect(await timings.count()).toBeGreaterThan(1);
  // Hit-test each timing: the point must land inside its own card, not on the
  // card stacked over it.
  const covered = await timings.evaluateAll((nodes) => nodes.filter((node) => {
    const card = node.closest("[data-stack-card]");
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + Math.min(8, r.width / 2), r.top + r.height / 2);
    return !card!.contains(hit);
  }).map((node) => node.closest("[data-stack-card]")!.getAttribute("data-booking-id")));
  expect(covered).toEqual([]);
});
