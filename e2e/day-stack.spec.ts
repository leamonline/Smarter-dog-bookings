// End-to-end coverage for the time-ordered day stack at /today.
//
// Replaces the four-zone board's spec. The board still ships behind
// FEATURE_FLAGS.legacy_salon_board_enabled and keeps its component tests, but
// it is no longer what /today renders, so the browser-level coverage follows
// the surface staff actually get.
//
// These run against the deterministic sample dataset in a real browser, so this
// is where layout, overflow, touch-target size and the full status journey are
// actually proven — the things jsdom cannot tell the truth about.
//
// The sample clock is Tuesday 14 July 2026. `/today` therefore shows Tuesday
// (three dogs, all Booked, live timings); `?date=2026-07-13` shows Monday,
// which carries one dog in every status and is the richer fixture for anything
// that is not time-relative.
import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");
const MONDAY = "/today?date=2026-07-13";

/** One dog's card. Located the way a member of staff finds it: by the name. */
function card(page: Page, dogName: string) {
  return page.locator("[data-stack-card]").filter({ hasText: dogName }).first();
}

function head(page: Page, dogName: string) {
  return card(page, dogName).locator("[data-stack-head]");
}

/** Open a dog's card and return it. */
async function openDog(page: Page, dogName: string) {
  const target = card(page, dogName);
  await target.locator("[data-stack-head]").click();
  await expect(target.locator("[data-stack-head]")).toHaveAttribute("aria-expanded", "true");
  return target;
}

async function settle(page: Page) {
  await page.locator("[data-day-stack]").waitFor();
}

test("the stack lists the whole day in appointment order", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  const pageHeading = page.getByRole("heading", { level: 1, name: "Daily Brief" });
  await expect(pageHeading).toBeAttached();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);

  // The date is the date-picker control, and it never leaves the screen: it is
  // the only guard against doing today's work on Monday's bookings.
  const dateControl = page.getByRole("button", {
    name: "Monday 13 July — choose a different date",
  });
  await expect(dateControl).toBeVisible();

  // Strict appointment order, with no grouping and no re-sorting by status.
  // Daisy (Completed) has left the stack; Milo has no status and is recovered
  // separately rather than being silently dropped.
  const names = await page.locator("[data-stack-card] [data-stack-head]").allInnerTexts();
  const order = names.join(" | ");
  expect(order.indexOf("Bella")).toBeLessThan(order.indexOf("Luna"));
  expect(order.indexOf("Luna")).toBeLessThan(order.indexOf("Rex"));
  expect(order).not.toContain("Daisy");
});

test("every card states its status as a word, never colour alone", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  await expect(card(page, "Bella")).toContainText("Checked in");
  await expect(card(page, "Charlie")).toContainText("In the bath");
  await expect(card(page, "Luna")).toContainText("Ready");
  await expect(card(page, "Rex")).toContainText("Expected");
});

test("a safety note is readable without a tap", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  // Max carries "Bites / Nips". It must be words on a collapsed card, not an
  // icon with a tooltip: a tooltip reaches neither a touch user nor a screen
  // reader, and this is welfare information.
  const maxCard = card(page, "Max");
  await expect(maxCard.locator("[data-stack-head]")).toHaveAttribute("aria-expanded", "false");
  await expect(maxCard).toContainText("Bites / Nips");
  await expect(maxCard.getByLabel("Safety alert: Bites / Nips")).toBeVisible();
});

test("a card expands in place, one at a time", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  await openDog(page, "Bella");
  await expect(card(page, "Bella")).toContainText("Sarah Jones");

  // Opening a second closes the first: two open at once pushes the day off
  // screen and turns a list you scan into a page you scroll.
  await openDog(page, "Rex");
  await expect(head(page, "Bella")).toHaveAttribute("aria-expanded", "false");
});

test("a dog can be walked through its whole day by keyboard alone", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today");
  await settle(page);

  const coco = card(page, "Coco");
  await coco.locator("[data-stack-head]").focus();
  await page.keyboard.press("Enter");
  await expect(coco.locator("[data-stack-head]")).toHaveAttribute("aria-expanded", "true");

  // Booked → Checked in.
  await coco.getByRole("button", { name: "Check in — Coco" }).focus();
  await page.keyboard.press("Enter");
  await expect(coco).toContainText("Checked in");

  // Checked in → In bath.
  await coco.getByRole("button", { name: "Start groom — Coco" }).focus();
  await page.keyboard.press("Enter");
  await expect(coco).toContainText("In the bath");

  // In bath → Ready. The prompt that follows is staff-driven and says so;
  // nothing has been sent to anyone at this point.
  await coco.getByRole("button", { name: "Mark ready — Coco" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(coco).toContainText("Ready");
});

test("the check-out chain takes the money and hands the dog back in one go", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  // Charlie is mid-groom on a deposit, so there is a real balance to take.
  const charlie = await openDog(page, "Charlie");
  await charlie.getByRole("button", { name: "Mark ready — Charlie" }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(charlie).toContainText("Ready");

  const chain = charlie.locator("[data-checkout-chain]");
  await expect(chain.getByRole("button")).toHaveCount(1);
  await chain.getByRole("button", { name: /^Check out/ }).click();

  // Three steps, because money is owed: the method, then the confirmation.
  await expect(chain.getByRole("button", { name: /^Cash £/ })).toBeVisible();
  await expect(chain.getByRole("button", { name: /^Card £/ })).toBeVisible();
  await chain.getByRole("button", { name: /^Cash £/ }).click();

  const confirm = chain.getByRole("button", { name: /^Collected · £/ });
  await expect(confirm).toContainText("cash");
  await confirm.click();

  // Only that last press writes, and the collected dog leaves the stack.
  await expect(page.locator("[data-stack-card]").filter({ hasText: "Charlie" })).toHaveCount(0);
});

test("a dog with nothing to pay skips the payment step entirely", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  // Luna is Ready and already Paid in Full.
  const luna = await openDog(page, "Luna");
  const chain = luna.locator("[data-checkout-chain]");
  await chain.getByRole("button", { name: /^Check out/ }).click();

  await expect(chain.getByRole("button", { name: /^Cash £/ })).toHaveCount(0);
  await expect(chain.getByRole("button", { name: "Collected — Luna" })).toBeVisible();
  await chain.getByRole("button", { name: "Collected — Luna" }).click();
  await expect(page.locator("[data-stack-card]").filter({ hasText: "Luna" })).toHaveCount(0);
});

test("checking a dog in offers Undo, and Undo puts it back", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today");
  await settle(page);

  const poppy = await openDog(page, "Poppy");
  await poppy.getByRole("button", { name: "Check in — Poppy" }).click();
  await expect(poppy).toContainText("Checked in");

  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(card(page, "Poppy")).toContainText("Expected");
});

test("marking ready never claims to have messaged anyone", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  const charlie = await openDog(page, "Charlie");
  const ready = charlie.getByRole("button", { name: "Mark ready — Charlie" });
  await expect(ready).toBeVisible();
  await expect(ready).not.toContainText(/text|message/i);
});

test("a long wait is marked by weight and a clock, not by a new colour", async ({ page }) => {
  // install() rather than setFixedTime(), because this test needs the minute
  // tick to actually fire: the stack re-reads the clock on an interval so that
  // "waiting 50 min" stays true without anybody touching the screen.
  await page.clock.install({ time: SAMPLE_NOW });
  await page.goto("/today");
  await settle(page);

  // Walk Teddy to Ready. Offline, the lifecycle mirror stamps ready_at exactly
  // as the database trigger would, so the wait is a real elapsed figure.
  const teddy = await openDog(page, "Teddy");
  await teddy.getByRole("button", { name: "Check in — Teddy" }).click();
  await teddy.getByRole("button", { name: "Start groom — Teddy" }).click();
  await teddy.getByRole("button", { name: "Mark ready — Teddy" }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(teddy).toContainText("Ready");

  const before = await card(page, "Teddy").evaluate((el) => ({
    width: parseFloat(getComputedStyle(el).borderLeftWidth),
    colour: getComputedStyle(el).borderLeftColor,
  }));

  await page.clock.fastForward("50:00");
  await expect(card(page, "Teddy")).toContainText(/waiting/);

  const after = await card(page, "Teddy").evaluate((el) => ({
    width: parseFloat(getComputedStyle(el).borderLeftWidth),
    colour: getComputedStyle(el).borderLeftColor,
    clock: !!el.querySelector("svg"),
  }));

  expect(after.width).toBeGreaterThan(before.width);
  expect(after.clock).toBe(true);
  // Same hue, more weight. Urgency never introduces a colour of its own.
  expect(after.colour).toBe(before.colour);
  await expect(card(page, "Teddy")).toHaveAttribute("data-status-key", "ready");
});

test("elapsed time keeps counting without anybody touching the screen", async ({ page }) => {
  await page.clock.install({ time: SAMPLE_NOW });
  await page.goto("/today");
  await settle(page);

  const coco = await openDog(page, "Coco");
  await coco.getByRole("button", { name: "Check in — Coco" }).click();
  await expect(card(page, "Coco")).toContainText("Checked in");

  await page.clock.fastForward("40:00");
  await expect(card(page, "Coco")).toContainText("40 min");
});

test("every target a wet thumb has to hit is at least 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  const heads = page.locator("[data-stack-head]");
  for (let i = 0; i < (await heads.count()); i += 1) {
    expect((await heads.nth(i).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  const charlie = await openDog(page, "Charlie");
  const buttons = charlie.locator("[data-stack-actions] button");
  for (let i = 0; i < (await buttons.count()); i += 1) {
    expect((await buttons.nth(i).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("the stack never scrolls sideways, down to 320px", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(MONDAY);
    await settle(page);
    await openDog(page, "Bella");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test("the unknown-status warning still opens the affected booking", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  // Milo has no status at all. It must never be silently dropped from the day.
  await page.getByRole("button", { name: /Milo/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the full invoice is still one tap away and fits the viewport", async ({
  page,
}, testInfo) => {
  // The same per-project sizes the board's spec used. 390px is deliberately NOT
  // among them: the mini invoice overflows by ~2px at exactly that width, which
  // predates this work and is not the day stack's to fix here.
  const viewport =
    testInfo.project.name === "mobile"
      ? { width: 320, height: 568 }
      : testInfo.project.name === "tablet"
        ? { width: 768, height: 1024 }
        : { width: 1280, height: 640 };
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  const luna = await openDog(page, "Luna");
  await luna.getByRole("button", { name: "Open full invoice — Luna" }).click();

  const invoice = page.getByRole("dialog", { name: "Invoice · Luna" });
  await expect(invoice).toBeVisible();
  await expect(invoice.getByRole("button", { name: "Save payment" })).toBeInViewport();

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
});

test("a browsed date shows no live timing at all", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto(MONDAY);
  await settle(page);

  // Monday is history. A countdown or an elapsed figure on a past day would be
  // a number about now, printed next to work that finished yesterday.
  await expect(card(page, "Bella")).not.toContainText(/waiting|late|away|No arrival/);
  await expect(card(page, "Charlie")).not.toContainText(/waiting|late|away|No arrival/);
});
