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

    // The shell re-measures on an animation frame, so poll rather than read
    // once — WebKit settles a frame or two later than Chromium.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
      .toBeLessThanOrEqual(1);

    // A floor the window cannot honour used to win here, pushing the bottom of
    // the shell past the viewport. The panes clip their own overflow, so the
    // composer went with it and the page grew a second scrollbar to chase it.
    const shell = page.locator('[style*="--inbox-visible-height"]').first();
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBeLessThanOrEqual(SHORT.height);
    await expect(composer).toBeVisible();
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
