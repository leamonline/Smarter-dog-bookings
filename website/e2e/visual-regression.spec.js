import { test, expect } from '@playwright/test';
import { dismissLandingPopupBeforeNavigation } from './test-helpers.js';

async function acceptCookiesIfVisible(page) {
  const acceptButton = page.getByRole('button', { name: 'Accept' });
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click();
  }
}

test.describe('Visual sanity', () => {
  test.beforeEach(async ({ page }) => {
    await dismissLandingPopupBeforeNavigation(page);
    await page.goto('/');
    await acceptCookiesIfVisible(page);
  });

  test('logo and hero heading are visible', async ({ page }) => {
    await expect(page.getByAltText('Smarter Dog Grooming Salon').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Come scruffy/i })).toBeVisible();
  });

  test('page does not introduce horizontal overflow', async ({ page }) => {
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });

  test('mobile menu can be toggled when the toggle is visible', async ({ page }) => {
    const openMenuButton = page.getByRole('button', { name: 'Open menu' });
    if (await openMenuButton.isVisible().catch(() => false)) {
      await openMenuButton.click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.getByRole('button', { name: 'Close menu' }).click();
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
  });
});
