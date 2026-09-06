/* global process */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dismissLandingPopupBeforeNavigation } from './test-helpers.js';

// The dev server only builds a Supabase client when VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY are set. Any values work here because every
// RPC the homepage makes is stubbed below; without them the card cannot render
// and this spec skips rather than silently passing.
const supabaseConfigured = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function acceptCookiesIfVisible(page) {
  const acceptButton = page.getByRole('button', { name: 'Accept' });
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click();
  }
}

const CARD = 'section[aria-labelledby^="holiday-notice-"]';

async function stubHolidayNotices(page, notices) {
  await page.route('**/rest/v1/rpc/get_public_holiday_notices', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notices) }),
  );
  await page.route('**/rest/v1/rpc/get_public_salon_facts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );
  await page.route('**/rest/v1/rpc/get_public_open_days', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

test.describe('Holiday notice card', () => {
  test.skip(!supabaseConfigured, 'needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for the dev server');

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dismissLandingPopupBeforeNavigation(page);
  });

  test('is absent when the booking database has no verified holiday', async ({ page }) => {
    await stubHolidayNotices(page, []);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Come scruffy/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book for our return' })).toHaveCount(0);
  });

  test('shows an upcoming holiday beside the primary booking action and passes axe', async ({ page }, testInfo) => {
    await stubHolidayNotices(page, [{
      id: 'e2e-holiday', notice_from: isoDaysFromNow(-1), closed_from: isoDaysFromNow(10), reopens_on: isoDaysFromNow(17), phase: 'upcoming',
    }]);
    await page.goto('/');
    await acceptCookiesIfVisible(page);
    await expect(page.getByRole('heading', { name: 'Upcoming holiday' })).toBeVisible();
    await expect(page.getByText(/We reopen on/)).toBeVisible();
    const cta = page.getByRole('button', { name: 'Book for our return' });
    await expect(cta).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('holiday-upcoming.png') });

    // Scope to the card: the rest of the homepage has its own accessibility spec.
    const results = await new AxeBuilder({ page }).include(CARD).analyze();
    expect(results.violations).toEqual([]);
  });

  test('shows the away wording during the closure', async ({ page }, testInfo) => {
    await stubHolidayNotices(page, [{
      id: 'e2e-holiday', notice_from: isoDaysFromNow(-20), closed_from: isoDaysFromNow(-2), reopens_on: isoDaysFromNow(5), phase: 'away',
    }]);
    await page.goto('/');
    await acceptCookiesIfVisible(page);
    await expect(page.getByRole('heading', { name: 'We’re taking a little break' })).toBeVisible();
    await expect(page.getByText(/closed from/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('holiday-away.png') });
  });
});
