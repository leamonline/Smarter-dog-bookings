/**
 * Adds an init script that pre-dismisses the landing popup so it doesn't
 * overlay the page during e2e tests. The popup auto-shows ~1.2s after the
 * homepage loads, blocking interactions (CookieConsent Accept, hero CTAs, etc.).
 *
 * If the popup's storage key is bumped in src/components/LandingPopup.jsx,
 * update STORAGE_KEY here too.
 */
const STORAGE_KEY = 'landingPopupDismissed_v2';

export async function dismissLandingPopupBeforeNavigation(page) {
    await page.addInitScript((key) => {
        try {
            localStorage.setItem(key, 'true');
        } catch {
            // localStorage unavailable — popup may show and block interactions
        }
    }, STORAGE_KEY);
}
