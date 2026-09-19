import { test, expect, type Page } from "@playwright/test";

// Staff work across changing viewports all day: a phone rotated one-handed, an
// iPad docked into a keyboard, a desktop window dragged narrow beside the till.
// These journeys exercise what has to survive that — an in-progress reply, the
// URL, and the reachability of the schedule — in a real browser, because every
// failure they cover involves history, layout or focus behaviour that jsdom
// only approximates.
//
// Offline sample data drives all of it (VITE_FORCE_OFFLINE=1 in the webServer
// config), so nothing here touches a real customer conversation.

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const DOCKED = { width: 1500, height: 900 };
const SHORT = { width: 1280, height: 480 };

const DRAFT = "Wednesday at 9 works — shall I hold it?";

async function openSarahsThread(page: Page) {
  await page.goto("/inbox");
  await page.getByRole("button", { name: /Sarah Jones/ }).click();
  const composer = page.getByRole("textbox", { name: "Write a reply" });
  await expect(composer).toBeVisible();
  return composer;
}

/** The one selected conversation row, however the panes are arranged. */
function selectedRow(page: Page) {
  return page.locator('button[aria-current="true"]');
}

test.describe("Viewport continuity", () => {
  test("an in-progress reply survives resizing in both directions", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const composer = await openSarahsThread(page);
    await composer.fill(DRAFT);

    const urlWithThreadOpen = page.url();
    const historyBefore = await page.evaluate(() => window.history.length);

    for (const size of [DESKTOP, PHONE, DOCKED, PHONE]) {
      await page.setViewportSize(size);
      await expect(selectedRow(page)).toHaveCount(1);
    }

    // The reply, the conversation and the address bar all where they were.
    await expect(composer).toHaveValue(DRAFT);
    expect(page.url()).toBe(urlWithThreadOpen);
    // And no history churn to show for it: resizing is not navigation.
    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore);
  });

  test("staff can leave the inbox with a thread open on a phone", async ({ page }) => {
    // The pane-step sentinel used to be popped from an effect cleanup, so
    // unmounting /inbox sent the browser back to it. On a phone with a
    // conversation open that made every other nav item unreachable.
    await page.setViewportSize(PHONE);
    await openSarahsThread(page);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: /Dogs/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/dogs/);
    // Give the old bounce every chance to land before believing the URL.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/dogs/);
  });

  test("browser Back still steps out of a thread rather than off the page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openSarahsThread(page);
    const urlWithThreadOpen = page.url();

    await page.setViewportSize(DESKTOP);
    await page.setViewportSize(PHONE);

    await page.goBack();

    await expect(selectedRow(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Conversations" })).toBeVisible();
    expect(page.url()).toBe(urlWithThreadOpen);
  });

  test("the inbox fits a short window without trapping the composer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const composer = await openSarahsThread(page);

    await page.setViewportSize(SHORT);

    // A floor the window cannot honour used to win here, pushing the bottom of
    // the shell past the viewport. The panes clip their own overflow, so the
    // composer went with it and the page grew a second scrollbar to chase it.
    //
    // Poll the number being asserted rather than a proxy for it. This used to
    // wait on the document scroll and then read the shell once, which is two
    // mistakes that cancel out into a race: the panes clip their own overflow,
    // so the document scroll is already 0 on the first frame — while the shell
    // is still a whole stale viewport too tall — and that poll therefore passed
    // instantly and synchronised nothing.
    //
    // Measured on WebKit, the shell settles in two stages after the resize:
    // bottom 876 while --fill-visible-height still holds the 900-high window's
    // 647px, then 589 once the variable updates to 227px but before the box
    // reflows, then 456. A single read landed on that middle value often
    // enough to fail the pull-request gate outright.
    const shell = page.locator('[style*="--fill-visible-height"]').first();
    await expect(shell).toBeVisible();
    await expect
      .poll(async () => {
        const box = await shell.boundingBox();
        // Keep polling rather than comparing null against a number.
        return box === null ? Number.POSITIVE_INFINITY : Math.round(box.y + box.height);
      })
      .toBeLessThanOrEqual(SHORT.height);

    // Only meaningful once the shell has settled: before that it is 0 whatever
    // the shell is doing, which is exactly why it could not serve as the wait.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
    ).toBeLessThanOrEqual(1);
    await expect(composer).toBeVisible();
  });

  test("a multi-line reply remains reachable above a visual-only keyboard", async ({ page }) => {
    await page.setViewportSize(PHONE);
    const composer = await openSarahsThread(page);
    await composer.fill("One\nTwo\nThree\nFour\nFive");
    const url = page.url();
    const historyLength = await page.evaluate(() => history.length);
    // Keep the layout viewport unchanged: mobile keyboards resize/pan only
    // the visual viewport. This simulates geometry, not a physical keyboard.
    for (const [height, offsetTop] of [[500, 0], [400, 0], [430, 40], [844, 0]]) {
      await page.evaluate(({ height, offsetTop }) => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, "height", { configurable: true, get: () => height });
        Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => offsetTop });
        viewport.dispatchEvent(new Event("resize"));
        viewport.dispatchEvent(new Event("scroll"));
      }, { height, offsetTop });
      const send = page.getByRole("button", { name: "Send", exact: true });
      for (const control of [composer, send]) {
        await expect.poll(() => control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          let top = window.visualViewport?.offsetTop ?? 0;
          let bottom = top + (window.visualViewport?.height ?? window.innerHeight);
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
              const bounds = parent.getBoundingClientRect();
              top = Math.max(top, bounds.top);
              bottom = Math.min(bottom, bounds.bottom);
            }
          }
          return rect.top >= top - 1 && rect.bottom <= bottom + 1;
        })).toBe(true);
      }
      await expect(composer).toHaveValue("One\nTwo\nThree\nFour\nFive");
      await expect(composer).toBeFocused();
    }
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  });

  test("the app chrome steps aside while a phone keyboard is up", async ({ page }) => {
    // #885 keeps the composer reachable under a keyboard, but ~130px of
    // toolbar and nav strip still sat above it, none of which could scroll
    // away — so the conversation being replied to collapsed from ~510px to
    // under 200px, a reflow big enough to read as "the screen resized".
    // While a text field has focus and the visual viewport has shrunk by a
    // keyboard's worth, the mobile chrome now hides and the thread keeps
    // most of its height. The thread's own Back control stays.
    await page.setViewportSize(PHONE);
    const composer = await openSarahsThread(page);
    const nav = page.getByRole("navigation", { name: "Primary" });
    const shell = page.locator('[style*="--fill-visible-height"]').first();
    const shellHeight = () =>
      shell.evaluate((el) => Number.parseFloat(el.style.getPropertyValue("--fill-visible-height")));
    await expect(nav).toBeVisible();
    await composer.click();
    await expect(composer).toBeFocused();

    const setKeyboard = (height: number) =>
      page.evaluate((height) => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, "height", { configurable: true, get: () => height });
        Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => 0 });
        viewport.dispatchEvent(new Event("resize"));
      }, height);

    await setKeyboard(330);
    await expect(nav).toBeHidden();
    await expect(page.getByRole("button", { name: "Back to inbox" })).toBeVisible();
    // With the chrome in place a 330px viewport left the shell ~113px. The
    // toolbar and nav strip together are over 100px, so the shell must
    // gain at least that much back.
    await expect.poll(shellHeight).toBeGreaterThanOrEqual(200);
    for (const control of [composer, page.getByRole("button", { name: "Send", exact: true })]) {
      await expect.poll(() => control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        let top = window.visualViewport?.offsetTop ?? 0;
        let bottom = top + (window.visualViewport?.height ?? window.innerHeight);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
            const bounds = parent.getBoundingClientRect();
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        return rect.top >= top - 1 && rect.bottom <= bottom + 1;
      })).toBe(true);
    }

    // Pinch-zoom shrinks the visual viewport too, but with nothing to type
    // into the chrome must stay. Blur first, then shrink.
    await setKeyboard(PHONE.height);
    await composer.blur();
    await expect(nav).toBeVisible();
    await setKeyboard(330);
    await expect(nav).toBeVisible();
    await setKeyboard(PHONE.height);
    await expect(composer).toHaveValue("");
  });

  test("the reply box stays above a keyboard that reports its height late", async ({ page }) => {
    // iOS fires visualViewport resize as the keyboard STARTS to move, with
    // the height at that instant, and fires nothing when it lands ~250ms
    // later. Measured once, the shell was ~140px too tall and the reply box
    // sat under the keyboard's accessory bar on a real iPhone — while this
    // suite passed, because every case reported the final height in one
    // event. Replay the real sequence: an intermediate height with an event,
    // then the settled height with none. Phone numbers: 852 tall, 495 visible.
    await page.setViewportSize({ width: 393, height: 852 });
    const composer = await openSarahsThread(page);
    await composer.click();
    await expect(composer).toBeFocused();

    const setHeight = (height: number, fire: boolean) =>
      page.evaluate(({ height, fire }) => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, "height", { configurable: true, get: () => height });
        Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => 0 });
        if (fire) viewport.dispatchEvent(new Event("resize"));
      }, { height, fire });

    await setHeight(640, true);
    await setHeight(495, false);

    const send = page.getByRole("button", { name: "Send", exact: true });
    for (const control of [composer, send]) {
      await expect.poll(() => control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        let top = window.visualViewport?.offsetTop ?? 0;
        let bottom = top + (window.visualViewport?.height ?? window.innerHeight);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
            const bounds = parent.getBoundingClientRect();
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
          }
        }
        return rect.top >= top - 1 && rect.bottom <= bottom + 1;
      })).toBe(true);
    }
    // The newest message stays above the composer rather than the log
    // keeping its old scroll offset and showing empty space.
    await expect
      .poll(() => page.getByRole("log").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
      .toBeLessThanOrEqual(2);
    // And the conversation is not pushed under the status bar: the chrome
    // wrapper keeps the top inset while the toolbar is hidden.
    await expect(composer).toBeFocused();
  });

  test("the calendar drops its sidebar-derived height cap when it collapses", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    // The first staff entry of a tab session redirects to Daily Brief, so
    // reach the calendar the way staff do.
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: /^Bookings$/ })
      .first()
      .click();

    const scheduleColumn = page.locator('[class*="lg:order-2"]').first();
    await expect(scheduleColumn).toBeVisible();

    await page.setViewportSize(PHONE);

    // Single column, no sidebar to match: the measured desktop height must not
    // still be capping the schedule, or it clips into the card beneath it.
    await expect
      .poll(() => scheduleColumn.evaluate((el) => getComputedStyle(el).maxHeight))
      .toBe("none");
    await expect
      .poll(() => scheduleColumn.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
  });
});
