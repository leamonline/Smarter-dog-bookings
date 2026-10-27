import { expect, test } from "@playwright/test";

for (const directory of ["dogs", "humans"]) {
  test(`${directory} search keeps a usable phone row and returns focus on clear`, async ({ page, isMobile }) => {
    await page.goto(`/${directory}`);
    const search = page.getByRole("searchbox");
    const action = page.getByRole("button", { name: directory === "dogs" ? "Add dog" : "Add client", exact: true });
    await expect(search).toBeVisible();
    await expect(action).toBeVisible();
    const searchBox = await search.boundingBox();
    const actionBox = await action.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      expect(searchBox!.width).toBeGreaterThan(330);
      expect(searchBox!.y).toBeGreaterThanOrEqual(actionBox!.y + actionBox!.height);
      await expect(search).toHaveCSS("font-size", "16px");
    }
    const query = directory === "dogs" ? "Bella" : "Sarah";
    await search.fill(query);
    await expect(search).toHaveValue(query);
    const clear = page.getByRole("button", { name: "Clear search" });
    if (isMobile) {
      const box = await clear.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await clear.click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(action).toHaveCSS("background-color", "rgb(254, 204, 19)");
  });
}

test("Daily Brief keeps recovery ahead of unchanged cards and groups quieter totals", async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date("2026-07-14T09:15:00+01:00"));
  await page.goto("/today?date=2026-07-13");
  const first = page.locator("[data-stack-card]").first();
  await expect(first).toBeVisible();
  const recovery = page.getByRole("alert").filter({ hasText: "status fixed" });
  await expect(recovery).toBeVisible();
  const card = await first.boundingBox();
  const warning = await recovery.boundingBox();
  expect(warning!.y + warning!.height).toBeLessThanOrEqual(card!.y);
  await expect(page.getByRole("group", { name: "Day totals" })).toContainText("Salon open");
  await expect(page.getByRole("group", { name: "Day totals" })).toContainText("No online slots today");
  await expect(page.getByRole("group", { name: "Needs attention" })).toBeVisible();
  await expect(first.locator("[data-stack-header]")).toHaveCSS("height", "144px");
  if (isMobile) {
    const header = await page.getByTestId("page-header").boundingBox();
    // Exclude the sample-data banner: header-to-first-dog was 319px, now 271px.
    expect(card!.y - header!.y).toBeLessThan(280);
  }
  await page.getByRole("button", { name: /Manage availability/ }).click();
  await expect(page.getByRole("heading", { name: "Manage availability", exact: true })).toBeVisible();
});
