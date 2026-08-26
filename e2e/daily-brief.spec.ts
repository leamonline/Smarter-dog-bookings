// End-to-end coverage for the live salon board at /today.
//
// These run against the deterministic sample dataset in a real browser, so
// they are where layout, overflow, touch-target size and the responsive
// behaviour of the action panels are actually proven — the things jsdom
// cannot tell the truth about.
import { expect, test, type Page } from "@playwright/test";

const SAMPLE_NOW = new Date("2026-07-14T09:15:00+01:00");

/** The one gesture the board rests on: find the dog, press the dog. */
function dogToken(page: Page, dogName: string) {
  return page.getByRole("button", { name: new RegExp(`^${dogName}\\.`) });
}

function zone(page: Page, name: string) {
  return page.getByRole("region", { name });
}

/** The panel that is already open, in whichever shape this width uses. */
async function openPanelFor(page: Page, dogName: string) {
  const menu = page.getByRole("menu", { name: `Actions for ${dogName}` });
  return (await menu.count()) ? menu : page.getByRole("dialog");
}

/** Opens a dog's actions and returns whichever panel this width uses. */
async function openDog(page: Page, dogName: string) {
  await dogToken(page, dogName).click();
  return openPanelFor(page, dogName);
}

test("the board keeps its three zones usable at every supported width", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "tablet") {
    await page.setViewportSize({ width: 1024, height: 1366 });
  }
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const pageHeading = page.getByRole("heading", { level: 1, name: "Daily Brief" });
  await expect(pageHeading).toBeAttached();
  await expect(pageHeading).toHaveClass(/sr-only/);
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);

  // One header anatomy at every width: the date IS the date-picker control,
  // and the availability button carries its own state as a sub-label.
  const dateControl = page.getByRole("button", {
    name: "Monday 13 July — choose a different date",
  });
  await expect(dateControl).toBeVisible();
  const availability = page.getByRole("button", { name: /Manage availability/ });
  await expect(availability).toBeVisible();
  expect((await availability.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  // The board never scrolls the page sideways, at any width.
  expect(
    await page.evaluate(() => ({
      documentFits:
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      bodyFits: document.body.scrollWidth <= document.body.clientWidth,
    })),
  ).toEqual({ documentFits: true, bodyFits: true });

  // All three zones are always present — a dog is always in the same place.
  await expect(zone(page, "Arriving, 2 dogs")).toBeVisible();
  await expect(zone(page, "With us, 2 dogs")).toBeVisible();
  await expect(zone(page, "Ready, 1 dog")).toBeVisible();

  await expect(zone(page, "Arriving, 2 dogs")).toContainText("Max");
  await expect(zone(page, "With us, 2 dogs")).toContainText("Bella");
  await expect(zone(page, "Ready, 1 dog")).toContainText("Luna");

  // Finished work collapses to one line; a bad status still shouts.
  const home = page.getByRole("region", { name: /^Gone home, 1 dog/ });
  await expect(home).toBeVisible();
  await expect(
    home.getByRole("button", { name: /^Show 1 dog (gone|went) home$/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("alert").filter({ hasText: "status fixed" })).toBeVisible();

  // Every token is a comfortable target, whatever the pointer.
  for (const name of ["Max", "Bella", "Luna"]) {
    const box = await dogToken(page, name).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const zoneColumns = await zone(page, "Arriving, 2 dogs").locator("..").evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(zoneColumns).toBe(
    testInfo.project.name === "desktop" ? 3 : testInfo.project.name === "tablet" ? 3 : 1,
  );

  await dateControl.click();
  const datePicker = page.getByRole("dialog", { name: "July 2026" });
  // The cell's aria-label is a full en-GB date, and en-GB gained a comma after
  // the weekday in a recent CLDR release — so whether it is there depends on the
  // browser build. Match either, as DatePickerModal's own unit test does.
  await datePicker.getByRole("button", { name: /^Wednesday,? 15 July 2026/ }).click();
  await expect(page).toHaveURL(/date=2026-07-15/);
  await expect(page.getByText("No bookings on this date")).toBeVisible();
});

test("a dog can be walked through its whole day by keyboard alone", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  // Reach the dog, open its actions with the keyboard, act with Enter.
  const max = dogToken(page, "Max");
  await max.focus();
  await page.keyboard.press("Enter");

  const maxPanel = await openPanelFor(page, "Max");
  await expect(maxPanel).toBeVisible();
  // Focus lands inside the panel, so the keyboard can act immediately.
  expect(
    await maxPanel.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);

  await maxPanel.getByRole("menuitem", { name: /^Check in/ })
    .or(maxPanel.getByRole("button", { name: /^Check in/ }))
    .press("Enter");
  // Max moved zone, and focus came back to the dog that moved — the board
  // keeps its place under a keyboard exactly as it does under a finger.
  await expect(zone(page, "With us, 3 dogs")).toContainText("Max");
  await expect(max).toBeFocused();

  // The rest of the journey, still without a mouse: Ready fires the
  // staff-reviewed collection notice, then the balance is taken.
  const charlie = dogToken(page, "Charlie");
  await charlie.focus();
  await page.keyboard.press("Enter");
  let charliePanel = await openPanelFor(page, "Charlie");
  await charliePanel.getByRole("menuitem", { name: /^Ready for collection/ })
    .or(charliePanel.getByRole("button", { name: /^Ready for collection/ }))
    .press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(zone(page, "Ready, 2 dogs")).toContainText("Charlie");

  await dogToken(page, "Charlie").click();
  charliePanel = await openPanelFor(page, "Charlie");
  await charliePanel.getByRole("menuitem", { name: /^Take £/ })
    .or(charliePanel.getByRole("button", { name: /^Take £/ }))
    .press("Enter");
  const invoice = page.getByRole("dialog", { name: /Invoice/ });
  await expect(invoice).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(invoice).not.toBeVisible();
});

test("Escape closes the action panel and puts focus back on the dog", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const max = dogToken(page, "Max");
  await max.click();
  await expect(page.getByRole("menu", { name: "Actions for Max" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(max).toBeFocused();
});

test("the action panel is never clipped by the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 560 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  await dogToken(page, "Luna").click();
  const panel = page.getByRole("menu", { name: "Actions for Luna" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);

  // The dismiss listener arms a beat after opening, so the tap's own scroll
  // cannot close what it just opened. Wait past that, then scroll.
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect(panel).toHaveCount(0);
});

test("a phone gets a bottom sheet, not a menu, and it fits at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  await dogToken(page, "Luna").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "Luna" })).toBeVisible();

  // Every row is a real thumb target and nothing runs off the side.
  const rows = sheet.getByRole("button");
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);
  for (let index = 0; index < count; index += 1) {
    const box = await rows.nth(index).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(32);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);

  await sheet.getByRole("button", { name: /^Mark collected/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^Gone home, 2 dogs/ })).toBeVisible();
});

test("checking a dog in moves it between zones and offers Undo", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  await expect(zone(page, "Arriving, 3 dogs")).toContainText("Coco");
  await expect(zone(page, "With us, 0 dogs")).toBeVisible();

  const panel = await openDog(page, "Coco");
  await panel.getByRole("button", { name: /^Check in/ }).or(
    panel.getByRole("menuitem", { name: /^Check in/ }),
  ).click();

  // The dog is now in the next zone, and the move is repairable in one press.
  await expect(zone(page, "Arriving, 2 dogs")).toContainText("Teddy");
  await expect(zone(page, "With us, 1 dog")).toContainText("Coco");
  await expect(page.getByText("Coco checked in — with us now")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Coco moved back to arriving")).toBeVisible();
  await expect(zone(page, "Arriving, 3 dogs")).toContainText("Coco");
  await expect(zone(page, "With us, 0 dogs")).toBeVisible();
});

test("urgency is spatial: the late dog leads its zone and is marked, not just coloured", async ({
  page,
}) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const arriving = zone(page, "Arriving, 3 dogs");
  const tokens = arriving.locator("[data-token-cell]");
  // Coco is 45 minutes overdue at 09:15, so it sorts to the front.
  await expect(tokens.first()).toHaveAttribute("data-booking-id", "101");
  await expect(tokens.first()).toHaveAttribute("data-tier", "urgent");
  // The lateness is stated in words — once, on the slot the dog is booked into,
  // not implied by the ring and not repeated under every dog due then.
  await expect(
    arriving.locator('[data-slot-group="08:30"] [data-slot-timing]'),
  ).toHaveText("45 min late");
  // And spoken in full to a screen reader.
  await expect(dogToken(page, "Coco")).toHaveAccessibleName(/Late, 45 min overdue/);
});

test("the slot time sits beside its dogs on a wide screen and above them below xl", async ({
  page,
}) => {
  await page.clock.setFixedTime(SAMPLE_NOW);

  // The gutter's breakpoint is measured, not guessed: it takes 80px off the
  // token grid, which is free at 1280 and costs a whole token column below it
  // — at which point the "saving" makes the zone TALLER than the heading it
  // replaced. So the layout must actually flip at xl, not merely look right.
  const geometry = async () =>
    page.evaluate(() => {
      const group = document.querySelector('[data-slot-group="08:30"]')!;
      const time = group.querySelector("h3")!.getBoundingClientRect();
      const token = group.querySelector("[data-token-cell]")!.getBoundingClientRect();
      return { timeRight: time.right, timeBottom: time.bottom, tokenLeft: token.left, tokenTop: token.top };
    });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/today?date=2026-07-13");
  await page.getByRole("region", { name: /^Arriving,/ }).waitFor();
  const wide = await geometry();
  expect(wide.timeRight).toBeLessThanOrEqual(wide.tokenLeft);
  expect(wide.timeBottom).toBeGreaterThan(wide.tokenTop);

  await page.setViewportSize({ width: 768, height: 1100 });
  await page.getByRole("region", { name: /^Arriving,/ }).waitFor();
  const narrow = await geometry();
  expect(narrow.timeBottom).toBeLessThanOrEqual(narrow.tokenTop);
});

test("a shared appointment time is stated once, not under every dog booked into it", async ({
  page,
}) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  // Max (08:30) and Rex (12:00) are each alone in their slot here, so each
  // group heads one dog — and neither dog prints its own time.
  const arriving = zone(page, "Arriving, 2 dogs");
  const groups = arriving.locator("[data-slot-group]");
  await expect(groups).toHaveCount(2);
  await expect(groups.first().getByRole("heading", { level: 3 })).toHaveText("08:30");
  await expect(arriving.locator("[data-token-meta]")).toHaveCount(0);

  // Every dog is still reachable and still says its own time out loud.
  await expect(dogToken(page, "Max")).toHaveAccessibleName(/Max\./);
  await expect(dogToken(page, "Rex")).toHaveAccessibleName(/Arriving/);
});

test("a quiet early morning shows a calm board and no alarms", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-07-14T06:30:00+01:00"));
  await page.goto("/today?date=2026-07-14");

  await expect(zone(page, "Arriving, 3 dogs").locator("[data-token-cell]")).toHaveCount(3);
  await expect(page.locator('[data-tier="urgent"]')).toHaveCount(0);
  // Empty zones say so in one quiet line; they do not disappear, because
  // their position is what makes the board readable.
  await expect(zone(page, "With us, 0 dogs")).toContainText("Nobody in");
  await expect(zone(page, "Ready, 0 dogs")).toContainText("Nobody waiting");
});

test("the header answers 'does anything need me?' and highlighting keeps every dog in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const status = page.getByRole("region", { name: "Day status" });
  await expect(status).toContainText(/thing(s)? need(s)? you/);
  await expect(status).toContainText(/\d+ arriving/);

  const totalTokens = await page.locator("[data-token-cell]").count();
  const highlight = page.getByRole("button", { name: /Highlight the .* needing attention/ });
  await expect(highlight).toHaveAttribute("aria-pressed", "false");
  await highlight.focus();
  await page.keyboard.press("Enter");

  const active = page.getByRole("button", { name: /Stop highlighting/ });
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(active).toContainText("Clear");
  await expect(page.getByText(/Highlighting \d+ dogs? that needs? you/)).toBeVisible();

  // Nothing was removed — the calm dogs are dimmed, not hidden, so the board
  // a groomer memorised is still the board in front of them.
  expect(await page.locator("[data-token-cell]").count()).toBe(totalTokens);
  expect(
    await page.locator('[data-token-cell][data-needs-attention="true"]').count(),
  ).toBeGreaterThan(0);
});

test("staff confirm an unconfirmed arrival, and can undo it two ways", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  // Poppy's reminder went out unanswered.
  await expect(dogToken(page, "Poppy")).toHaveAccessibleName(/Poppy/);
  let panel = await openDog(page, "Poppy");
  const confirm = panel.getByRole("menuitem", { name: /^Confirm booking/ }).or(
    panel.getByRole("button", { name: /^Confirm booking/ }),
  );
  await expect(confirm).toBeVisible();
  expect((await confirm.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await confirm.click();
  await expect(page.getByText("Poppy's booking confirmed")).toBeVisible();

  // Safety net 1 — the toast's Undo.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Poppy's booking is unconfirmed again")).toBeVisible();

  // Safety net 2 — Unconfirm stays in the panel, outlasting the toast.
  panel = await openDog(page, "Poppy");
  await panel
    .getByRole("menuitem", { name: /^Confirm booking/ })
    .or(panel.getByRole("button", { name: /^Confirm booking/ }))
    .click();
  panel = await openDog(page, "Poppy");
  await expect(
    panel.getByRole("menuitem", { name: /^Unconfirm booking/ })
      .or(panel.getByRole("button", { name: /^Unconfirm booking/ })),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A CUSTOMER-confirmed booking offers no Unconfirm at all — their word stands.
  const teddyPanel = await openDog(page, "Teddy");
  await expect(teddyPanel).toContainText(/Customer confirmed/);
  await expect(
    teddyPanel.getByRole("menuitem", { name: /^Unconfirm booking/ })
      .or(teddyPanel.getByRole("button", { name: /^Unconfirm booking/ })),
  ).toHaveCount(0);
});

test("the panel reveals what the token deliberately does not print", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  // The token carries a face, a name and one number — no service, no owner.
  const lunaCell = page.locator('[data-token-cell][data-booking-id="3"]');
  await expect(lunaCell).not.toContainText("Emma Wilson");
  await expect(lunaCell).not.toContainText("Full Groom");

  const panel = await openDog(page, "Luna");
  await expect(panel).toContainText("Emma Wilson");
  await expect(panel).toContainText("Full Groom");
  await expect(panel).toContainText(/Ready|waiting/i);
});

test("a welfare note stays visible on the board, never only behind a tap", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  // Max carries "Bites / Nips" in the sample dataset — the safety rule is that
  // a welfare fact is never hidden behind a tap or a breakpoint, so it has to
  // be readable on the board itself before anyone presses anything.
  const maxCell = page.locator('[data-token-cell]', { has: page.getByText("Max", { exact: true }) });
  await expect(maxCell.locator("[data-token-safety]")).toBeAttached();
  const note = maxCell.locator("[data-token-safety-text]");
  await expect(note).toBeVisible();
  await expect(note).toHaveText("Bites / Nips");

  // And the full text is in the panel too, for a dog carrying more than one.
  const panel = await openDog(page, "Max");
  await expect(panel).toContainText("Bites / Nips");
});

test("unknown-status warning opens the affected booking directly", async ({ page }) => {
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const warning = page.getByRole("alert").filter({ hasText: "status fixed" });
  await expect(warning).toContainText("Milo");
  await expect(warning).toContainText("10:00");
  const fixBooking = warning.getByRole("button", { name: "Fix Milo's 10:00 booking" });
  await fixBooking.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Milo/i })).toBeVisible();
});

test("dog and human files open from the panel and preserve the date", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  let panel = await openDog(page, "Bella");
  await panel.getByRole("menuitem", { name: "Bella's file — Bella" }).click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  const dogDialog = page.getByRole("dialog", { name: /Bella/i });
  await expect(dogDialog).toBeVisible();
  await dogDialog.getByRole("button", { name: "Close" }).click();

  panel = await openDog(page, "Bella");
  await panel.getByRole("menuitem", { name: "Sarah Jones's file — Bella" }).click();
  await expect(page).toHaveURL(/\/today\?date=2026-07-13/);
  await expect(page.getByRole("dialog", { name: /Sarah Jones/i })).toBeVisible();
});

test("a dog can be dragged into the next zone, and never into a wrong one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-14");

  const coco = dogToken(page, "Coco");
  const withUs = zone(page, "With us, 0 dogs");
  const from = await coco.boundingBox();
  const to = await withUs.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 40, { steps: 12 });
  await page.mouse.up();

  await expect(zone(page, "With us, 1 dog")).toContainText("Coco");
  await expect(page.getByText("Coco checked in — with us now")).toBeVisible();
  // Releasing a dog opens no menu — a drag is not also a tap.
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Dragging backwards does nothing at all: a correction belongs in the panel.
  const cocoNow = dogToken(page, "Coco");
  const arriving = zone(page, "Arriving, 2 dogs");
  const back = await cocoNow.boundingBox();
  const target = await arriving.boundingBox();
  await page.mouse.move(back!.x + back!.width / 2, back!.y + back!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 40, { steps: 12 });
  await page.mouse.up();
  await expect(zone(page, "With us, 1 dog")).toContainText("Coco");
});

test("the mini invoice fits without scrolling at every supported viewport", async ({
  page,
}, testInfo) => {
  const viewport =
    testInfo.project.name === "mobile"
      ? { width: 320, height: 568 }
      : testInfo.project.name === "tablet"
        ? { width: 768, height: 1024 }
        : { width: 1280, height: 640 };

  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const panel = await openDog(page, "Charlie");
  await panel
    .getByRole("menuitem", { name: /^Ready for collection/ })
    .or(panel.getByRole("button", { name: /^Ready for collection/ }))
    .click();
  await page.getByRole("button", { name: "Not now" }).click();

  const readyPanel = await openDog(page, "Charlie");
  await readyPanel
    .getByRole("menuitem", { name: /^Take £/ })
    .or(readyPanel.getByRole("button", { name: /^Take £/ }))
    .click();

  const invoice = page.getByRole("dialog", { name: "Invoice · Charlie" });
  const invoiceBody = invoice.locator(".mini-invoice-body");
  await expect(invoice).toBeVisible();
  await expect(invoiceBody).toBeVisible();
  await expect(invoice.getByRole("button", { name: "Save payment" })).toBeInViewport();
  // The phone presentation slides up, so wait for it to settle before
  // measuring — the first frame is deliberately below the fold.
  await expect
    .poll(() => invoice.evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(viewport.height + 1);

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

  await invoice.getByRole("button", { name: "Save payment" }).click();
  await expect(invoice.getByRole("alert")).toContainText("Choose Cash, Card or Bank transfer");
});

test("compact widths keep one header anatomy and no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const dateControl = page.getByRole("button", {
    name: "Monday 13 July — choose a different date",
  });
  await expect(dateControl).toBeVisible();
  await dateControl.click();
  await expect(page.getByRole("dialog", { name: "July 2026" })).toBeVisible();
  await page.keyboard.press("Escape");

  const availability = page.getByRole("button", { name: /Manage availability/ });
  await expect(availability).toBeVisible();
  expect((await availability.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  // Zones stack on a phone; every one still present, still in journey order.
  const headings = await page.locator("[data-drop-zone] h2").allInnerTexts();
  expect(headings.map((text) => text.toLowerCase())).toEqual(["arriving", "with us", "ready"]);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});

test("a busy board stays inside its columns", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(SAMPLE_NOW);
  await page.goto("/today?date=2026-07-13");

  const overflow = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("[data-token-cell]")];
    return cells.filter((cell) => {
      const zoneElement = cell.closest("[data-drop-zone]");
      if (!zoneElement) return true;
      const cellBox = cell.getBoundingClientRect();
      const zoneBox = zoneElement.getBoundingClientRect();
      return cellBox.left < zoneBox.left - 1 || cellBox.right > zoneBox.right + 1;
    }).length;
  });
  expect(overflow).toBe(0);
});
