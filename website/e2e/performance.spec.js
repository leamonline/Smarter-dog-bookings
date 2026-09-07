import { test, expect } from '@playwright/test';
import { dismissLandingPopupBeforeNavigation } from './test-helpers.js';

async function acceptCookiesIfVisible(page) {
  const acceptButton = page.getByRole('button', { name: 'Accept' });
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click();
  }
}

test.describe('Performance sanity', () => {
  test.beforeEach(async ({ page }) => {
    await dismissLandingPopupBeforeNavigation(page);
  });

  test('navigation timings are within reasonable bounds', async ({ page }) => {
    await page.goto('/');
    await acceptCookiesIfVisible(page);

    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEventEnd: nav.loadEventEnd,
      };
    });

    expect(navTiming.domContentLoaded).toBeLessThan(5000);
    expect(navTiming.loadEventEnd).toBeLessThan(8000);
  });

  test('main bundle count remains small', async ({ page }) => {
    await page.goto('/');
    await acceptCookiesIfVisible(page);
    await page.waitForLoadState('networkidle');

    const resourceSummary = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const jsCount = resources.filter((r) => r.name.includes('.js')).length;
      const cssCount = resources.filter((r) => r.name.includes('.css')).length;
      return { jsCount, cssCount };
    });

    // This suite runs against the Vite dev server, so module request count is higher than prod.
    expect(resourceSummary.jsCount).toBeLessThanOrEqual(80);
    expect(resourceSummary.cssCount).toBeLessThanOrEqual(10);
  });
});
