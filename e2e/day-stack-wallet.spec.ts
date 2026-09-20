import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");
async function open(page: Page, path = "/today") {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(path);
  await page.locator("[data-day-stack]").waitFor();
}
async function geometry(page: Page) {
  return page.locator("[data-stack-card]").evaluateAll(nodes => nodes.map(node => {
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

test("fixed headers and uniform overlap retain real exposed hit targets", async ({ page }) => {
  await open(page, "/today?date=2026-07-13");
  const cards = await geometry(page);
  // Transformed rectangles can differ by ~0.00002px on high-DPI tablets.
  for (const card of cards) expect(card.height).toBeCloseTo(144, 3);
  for (let i = 2; i < cards.length; i++) {
    expect(cards[i].top - cards[i - 1].top).toBeCloseTo(96, 0);
    expect(cards[i].top).toBeLessThan(cards[i - 1].bottom);
  }
  const max = page.locator("[data-stack-card]").filter({ hasText: "Max" }).first();
  await max.locator("[data-stack-head]").scrollIntoViewIfNeeded();
  const warning = max.getByLabel("Safety alert: Bites / Nips");
  await warning.scrollIntoViewIfNeeded();
  const warningBox = await warning.boundingBox();
  expect(warningBox!.height).toBeGreaterThanOrEqual(44);
  expect(await warning.evaluate(node => {
    const r = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(r.left + 12, r.top + 22));
  })).toBe(true);
  const before = await max.locator("[data-stack-header]").boundingBox();
  await warning.click();
  await expect(max.locator("[data-stack-head]")).toHaveAttribute("aria-expanded", "true");
  await expect(max.locator("[data-stack-details]")).toContainText("Safety note: Bites / Nips");
  expect((await max.locator("[data-stack-header]").boundingBox())!.height).toBeCloseTo(before!.height, 3);
});

test("short and tall viewports bottom-align fitting stacks and keep overflow reachable", async ({ page }) => {
  for (const height of [740, 1024]) {
    await page.setViewportSize({ width: 390, height });
    await open(page);
    // Production sample mode adds a demo banner to the app chrome. Measure
    // the actual remaining space rather than assuming a fixed nav height.
    const rows = await geometry(page);
    if (rows[0].top + 396 <= height - 16) {
      await expect.poll(async () => (await geometry(page)).at(-1)!.bottom).toBeCloseTo(height - 16, 0);
    }
    await page.locator("[data-stack-card]").last().scrollIntoViewIfNeeded();
    const last = (await geometry(page)).at(-1)!;
    const main = await page.locator("main").boundingBox();
    expect(last.top).toBeGreaterThanOrEqual(main!.y);
    expect(last.bottom).toBeLessThanOrEqual(height);
    expect(await page.locator("main").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
});

test("selection brings a card forward, keeps its header fixed and leaves all future cards reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const heads = page.locator("[data-stack-head]");
  await heads.nth(1).click();
  await expect(heads.nth(1)).toHaveAttribute("aria-expanded", "true");
  const selected = page.locator('[data-stack-card][data-focused="true"]');
  await expect(selected).toContainText("Teddy");
  const scrollport = await page.locator("main").boundingBox();
  await expect.poll(async () => (await heads.nth(1).boundingBox())!.y).toBeCloseTo(scrollport!.y + 12, 0);
  expect((await selected.locator("[data-stack-header]").boundingBox())!.height).toBeCloseTo(144, 3);
  await heads.nth(2).click();
  await expect(heads.nth(1)).toHaveAttribute("aria-expanded", "false");
  await expect(heads.nth(2)).toHaveAttribute("aria-expanded", "true");
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
  }).toBeCloseTo(96, 0);
  await expect(page.locator("[data-refresh-indicator]")).toHaveCount(0);
});

test("scrolling down the day does not start refresh and reduced motion has no spring", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "/today?date=2026-07-13");
  await page.locator("main").evaluate(node => { node.scrollTop = 160; });
  await touch(page, "touchstart"); await touch(page, "touchmove", 180); await touch(page, "touchend");
  await expect(page.locator("[data-refresh-indicator]")).toHaveCount(0);
  expect(await page.locator("[data-stack-card]").first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
  await page.locator("[data-stack-head]").last().click();
  await expect(page.locator("[data-stack-head]").last()).toHaveAttribute("aria-expanded", "true");
});
