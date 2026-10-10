import { expect, test, type Locator, type Page } from "@playwright/test";

const BREAKPOINT_SWEEP = [
  360,
  639,
  640,
  700,
  767,
  768,
  1023,
  1024,
  1279,
  1280,
  1439,
  1440,
];

async function settleLayout(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

async function expectInsideViewport(locator: Locator) {
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const viewport = locator.page().viewportSize();
    if (!box || !viewport) return false;
    return (
      box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1
    );
  }).toBe(true);
}

test.describe("Booking and modal resize continuity", () => {
  test("the customer booking shell keeps an in-progress value across its summary breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 900 });
    await page.goto("/dev/booking-wizard-shell-preview");

    const frame = page.getByRole("region", { name: "Full booking shell continuity preview" });
    const note = frame.getByRole("textbox", { name: "In-progress booking note" });
    const summary = frame.getByRole("complementary", { name: "Your booking so far" });
    await note.fill("Keep this while the phone unfolds");
    await note.focus();

    const url = page.url();
    const historyLength = await page.evaluate(() => history.length);

    for (const width of [1023, 1024, 700, 1279, 1280, 1439, 1440, 360, 1024]) {
      await page.setViewportSize({ width, height: width === 700 ? 520 : 900 });
      await settleLayout(page);

      await expect(note).toHaveValue("Keep this while the phone unfolds");
      await expect(note).toBeFocused();
      if (width >= 1024) await expect(summary).toBeVisible();
      else await expect(summary).toBeHidden();
      expect(await frame.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
    }
  });

  test("the staff booking draft survives every layout boundary", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /new booking/i }).first().click();

    const dialog = page.getByRole("dialog", { name: "New booking" });
    const search = dialog.getByPlaceholder(/start typing a dog's name/i);
    await search.fill("bel");
    await dialog.getByRole("button", { name: /book bella/i }).first().dispatchEvent("mousedown");

    const service = dialog.getByRole("combobox", { name: /service for bella/i });
    await service.selectOption("bath-and-brush");
    await service.focus();

    const scrollBody = dialog.locator(".overflow-y-auto.flex-1");
    await scrollBody.evaluate((element) => {
      element.setAttribute("data-continuity-marker", "staff-booking-draft");
      const spacer = document.createElement("div");
      spacer.setAttribute("data-continuity-spacer", "");
      spacer.style.height = "900px";
      element.append(spacer);
      element.scrollTop = 180;
    });

    const url = page.url();
    const historyLength = await page.evaluate(() => history.length);

    for (const width of BREAKPOINT_SWEEP) {
      await page.setViewportSize({ width, height: width === 700 ? 520 : 900 });
      await settleLayout(page);

      await expect(dialog).toHaveCount(1);
      await expect(service).toHaveValue("bath-and-brush");
      await expect(service).toBeFocused();
      await expect(scrollBody).toHaveAttribute("data-continuity-marker", "staff-booking-draft");
      await expect.poll(() => scrollBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expectInsideViewport(dialog.getByRole("button", { name: /confirm booking/i }));
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
    }
  });

  test("an entity dialog changes between sheet and modal without remounting", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 760 });
    await page.goto("/humans");
    const opener = page.getByRole("button", { name: /view profile for/i }).first();
    await opener.focus();
    await expect(opener).toBeFocused();
    await opener.press("Enter");

    const dialog = page.getByRole("dialog");
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const scrollBody = dialog.locator(".overflow-y-auto").first();
    await dialog.evaluate((element) => element.setAttribute("data-continuity-marker", "entity-dialog"));
    await scrollBody.evaluate((element) => {
      const spacer = document.createElement("div");
      spacer.setAttribute("data-continuity-spacer", "");
      spacer.style.height = "900px";
      element.append(spacer);
      element.scrollTop = 160;
    });
    await close.focus();

    const url = page.url();
    const historyLength = await page.evaluate(() => history.length);

    for (const width of [639, 640, 639, 640]) {
      await page.setViewportSize({ width, height: 760 });
      await settleLayout(page);

      await expect(dialog).toHaveAttribute("data-continuity-marker", "entity-dialog");
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(close).toBeFocused();
      await expect.poll(() => scrollBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);

      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      if (width < 640) {
        expect(box!.width).toBeGreaterThanOrEqual(width - 1);
        expect(box!.height).toBeGreaterThanOrEqual(759);
      } else {
        expect(box!.width).toBeLessThan(width);
        expect(box!.height).toBeLessThan(760);
      }
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
});
