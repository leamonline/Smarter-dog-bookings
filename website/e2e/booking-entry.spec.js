import { test, expect } from '@playwright/test';
import { dismissLandingPopupBeforeNavigation } from './test-helpers.js';

test('mobile booking remains clickable before cookie consent', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dismissLandingPopupBeforeNavigation(page);
  await page.route('**/book/new', route => route.fulfill({ contentType: 'text/html', body: '<h1>Booking</h1>' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeVisible();
  const book = page.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Book now' });
  await book.click();
  await expect(page).toHaveURL(/\/book\/new$/);
});
