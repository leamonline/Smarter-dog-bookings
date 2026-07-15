import { test, expect } from "@playwright/test";

// The entity modals (human / dog / booking) become full-screen sheets
// below the sm breakpoint. These pin the sheet takeover and the pinned
// action bar on the mobile project, and the centred floating modal on
// desktop — both against the offline sample data.

test.describe("Entity modal shell", () => {
  test("human profile opens and closes from the directory", async ({ page }) => {
    await page.goto("/humans");
    // Activate via Enter — a centre click can land on the card's tel:
    // link, which stops propagation and never opens the profile.
    await page.getByRole("button", { name: /View profile for/i }).first().press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    const isMobile = viewport.width < 640;

    if (isMobile) {
      // Sheet takeover: the dialog fills the viewport edge to edge.
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
      // The pinned New-booking bar sits in thumb reach at the bottom.
      const cta = page.getByRole("button", { name: /new booking/i }).last();
      await expect(cta).toBeVisible();
      const ctaBox = (await cta.boundingBox())!;
      expect(ctaBox.y + ctaBox.height).toBeGreaterThan(viewport.height - 80);
    } else {
      // Centred floating modal, never edge to edge.
      expect(box.width).toBeLessThan(viewport.width);
    }

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });
});
