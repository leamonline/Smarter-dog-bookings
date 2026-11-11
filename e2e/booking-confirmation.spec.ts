import { expect, test } from "@playwright/test";

test("inline confirmation survives responsive layouts and books without a second dialog", async ({ page }) => {
  // Open through the desktop entry point, then exercise the same draft at
  // phone, landscape and tablet sizes instead of replacing its state.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /new booking/i }).first().click();
  const drawer = page.getByRole("dialog", { name: "New booking", exact: true });
  await drawer.getByPlaceholder(/start typing a dog's name/i).fill("bel");
  await drawer.getByRole("button", { name: /book bella/i }).first().dispatchEvent("mousedown");
  await drawer.getByRole("button", { name: "Next month", exact: true }).click();
  await drawer.getByRole("button", { name: /, available$/ }).first().click();
  await drawer.getByRole("button", { name: "10:00am", exact: true }).click();

  const summary = drawer.getByRole("region", { name: "Ready to book" });
  const method = summary.getByRole("combobox", { name: "Customer confirmation" });
  await expect(method).toHaveValue("auto");
  await expect(summary.getByText(/Guide total:/)).toBeVisible();
  await method.selectOption("none");

  for (const [width, height] of [[375, 667], [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await method.scrollIntoViewIfNeeded();
    await expect(method).toHaveValue("none");
    await expect(method).toBeVisible();
    const create = drawer.getByRole("button", { name: "Create booking", exact: true });
    await expect(create).toBeInViewport();
    expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }

  await drawer.getByRole("button", { name: "Create booking", exact: true }).click();
  await expect(drawer.getByRole("heading", { name: "Booking created", exact: true })).toBeVisible();
  await expect(drawer.getByText("Confirmation not requested", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("Send a booking confirmation?", { exact: true })).toHaveCount(0);
});
