import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dismissLandingPopupBeforeNavigation } from './test-helpers.js';

async function acceptCookiesIfVisible(page) {
  const acceptButton = page.getByRole('button', { name: 'Accept' });
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click();
  }
}

test.describe('Homepage E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dismissLandingPopupBeforeNavigation(page);
    await page.goto('/');
    await acceptCookiesIfVisible(page);
  });

  test('loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Smarter Dog Grooming Salon/i);
  });

  test('renders key homepage sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Come scruffy/i })).toBeVisible();

    const servicesHeading = page.getByRole('heading', { name: /How we care for your dog/i });
    await servicesHeading.scrollIntoViewIfNeeded();
    await expect(servicesHeading).toBeVisible();

    const reviewsHeading = page.getByRole('heading', { name: /Dogs who wouldn't go anywhere else/i });
    await reviewsHeading.scrollIntoViewIfNeeded();
    await expect(reviewsHeading).toBeVisible();
  });

  test('booking CTA navigates to the external booking portal', async ({ page, isMobile }) => {
    // Booking moved off-site (commit 438788a): the Book control now navigates
    // to the customer portal instead of opening an in-page modal. Since the
    // domain cutover that portal is same-origin at /book/login rather than on
    // smarterdog.vercel.app. Stub it so CI never depends on the live site,
    // then assert the browser actually navigated there.
    await page.route('**/book/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Booking portal stub</h1></body></html>',
      }),
    );

    // Hero/CTA "Book online" buttons are desktop-only (hidden md:flex);
    // the sticky MobileQuickActions "Book now" button is the mobile path.
    const ctaName = isMobile ? /^Book now$/i : /^Book online$/i;
    await page.getByRole('button', { name: ctaName }).first().click();

    await page.waitForURL('**/book/login');
    await expect(page.getByRole('heading', { name: 'Booking portal stub' })).toBeVisible();
  });

  test('shows footer contact details', async ({ page }) => {
    const footer = page.locator('footer');
    const footerHeading = page.getByRole('heading', { name: 'Opening Hours' });
    await footerHeading.scrollIntoViewIfNeeded();

    await expect(footerHeading).toBeVisible();
    await expect(footer.getByText('183 Kings Road', { exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'bookings@smarterdog.co.uk' })).toBeVisible();
  });

  test('has no automatically detectable accessibility violations on home view', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
