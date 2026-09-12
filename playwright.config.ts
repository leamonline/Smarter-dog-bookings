import { defineConfig, devices } from "@playwright/test";

// Playwright config for Smarter Dog Bookings E2E.
//
// The dev server runs with VITE_FORCE_OFFLINE=1 so tests exercise the
// deterministic sample dataset and don't depend on a live Supabase project.
//
// The full post-merge matrix deliberately remains Chromium-only: it provides
// desktop, tablet and mobile viewport coverage at its established cost. The
// pull-request gate opts into the production-build `pr-smoke` matrix below,
// which runs EVERY spec on desktop Chromium plus mobile WebKit smoke.
//
// Why every spec on pull requests: a spec that only runs after merge is a spec
// that can only fail on main — and main auto-deploys production. #690 shipped a
// broken daily-brief locator that way and left main red for three consecutive
// merges, because its pull request never ran the spec it had just rewritten.
// One viewport catches that class at roughly a third of the matrix cost; the
// three-viewport sweep stays post-merge for genuinely viewport-specific breaks.

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 4173;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const isPullRequestSmoke = process.env.PLAYWRIGHT_PR_SMOKE === "1";
// Hosted sandboxes (Claude Code on the web, similar containers) ship a
// pre-installed Chromium rather than the headless-shell build this Playwright
// version downloads. Point PLAYWRIGHT_CHROMIUM_EXECUTABLE at that binary (for
// example /opt/pw-browsers/chromium) and every Chromium project launches it;
// unset, Playwright uses its own managed browser exactly as before.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const chromiumLaunch = chromiumExecutable
  ? { launchOptions: { executablePath: chromiumExecutable } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: isPullRequestSmoke
    ? [
        {
          name: "desktop",
          use: { ...devices["Desktop Chrome"], browserName: "chromium", ...chromiumLaunch },
        },
        // WebKit stays deliberately narrow. It exists for cross-browser smoke
        // coverage, and the other specs have never been validated against it —
        // widening it here would trade a real gate for unrelated WebKit noise.
        //
        // viewport-continuity is the second spec to earn a place, and on the
        // same reasoning as the first: Safari is the browser on the iPhone and
        // iPad the salon actually triages from, and what that spec covers —
        // history entries, the visual viewport under an open keyboard, dvh
        // under collapsing browser chrome — is exactly where WebKit differs
        // from Chromium rather than merely duplicating it.
        //
        // In CI this testMatch is belt-and-braces, not the mechanism: the PR
        // gate names each project's specs on its own command line, because it
        // checks out the pull-request head and so may be running a config
        // older than the gate. See the comment in ci.yml. It still matters
        // locally, where `PLAYWRIGHT_PR_SMOKE=1 npx playwright test` should
        // reproduce what the gate runs.
        {
          name: "mobile-webkit",
          use: { ...devices["iPhone 13"], browserName: "webkit" },
          testMatch: /(smoke|viewport-continuity)\.spec\.ts/,
        },
      ]
    : [
        {
          name: "desktop",
          use: { ...devices["Desktop Chrome"], browserName: "chromium", ...chromiumLaunch },
        },
        {
          name: "tablet",
          use: { ...devices["iPad (gen 7)"], browserName: "chromium", ...chromiumLaunch },
        },
        {
          name: "mobile",
          use: { ...devices["iPhone 13"], browserName: "chromium", ...chromiumLaunch },
        },
        // A folding phone is two devices sharing a hinge, and neither matches
        // the three above. The cover screen is narrower than any phone preset;
        // the unfolded screen is near-square — wide enough to look like a
        // tablet and too short to behave like one. The layout bugs live in
        // that mismatch, so both get their own project.
        {
          name: "fold-cover",
          use: { viewport: { width: 360, height: 880 }, hasTouch: true, browserName: "chromium", ...chromiumLaunch },
          testMatch: /adaptive-layout\.spec\.ts/,
        },
        {
          name: "fold-open",
          use: { viewport: { width: 700, height: 850 }, hasTouch: true, browserName: "chromium", ...chromiumLaunch },
          testMatch: /adaptive-layout\.spec\.ts/,
        },
        // The new width ceiling is 1800px; nothing else in the matrix is wide
        // enough to reach it, so a 1440 run could never tell you it worked.
        {
          name: "wide-desktop",
          use: { viewport: { width: 1920, height: 1080 }, browserName: "chromium", ...chromiumLaunch },
          testMatch: /adaptive-layout\.spec\.ts/,
        },
      ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    env: {
      VITE_FORCE_OFFLINE: "1",
      VITE_E2E_WHATSAPP_UNREAD: "12",
      VITE_E2E_PENDING_SIGNUPS: "7",
      VITE_E2E_BOOKING_POLICY_RPC: "1",
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
