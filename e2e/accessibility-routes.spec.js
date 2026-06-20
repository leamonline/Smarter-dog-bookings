import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  { path: '/services', heading: /How we look after your dog/i },
  { path: '/approach', heading: /Our approach/i },
  { path: '/faq', heading: /Frequently Asked Questions/i },
  { path: '/privacy', heading: /Privacy Policy/i },
  { path: '/terms', heading: /Terms/i },
  { path: '/matted-coat-policy', heading: /Matted Coat Policy/i },
  // '/book' and '/houndsly' are intentionally omitted: both are pure external
  // redirects (ExternalRedirect -> window.location.replace to the customer
  // portal / houndsly.co.uk), so an axe scan would race the navigation away.
  // The redirect behaviour is covered by the unit test
  // src/components/ExternalRedirect.test.jsx.
];

test.describe('Route accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cookieConsent', 'true');
    });
  });

  for (const route of ROUTES) {
    test(`${route.path} has no automatically detectable accessibility violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
      await expect(page.locator('main#main-content')).toBeVisible();

      const results = await analyzeWithRetry(page);
      expect(results.violations, `a11y violations on route: ${route.path}`).toEqual([]);
    });
  }
});

async function analyzeWithRetry(page, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await new AxeBuilder({ page }).analyze();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(250);
    }
  }
  throw new Error('Failed to run accessibility analysis');
}
