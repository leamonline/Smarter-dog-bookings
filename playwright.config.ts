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
          use: { ...devices["Desktop Chrome"], browserName: "chromium" },
        },
        // WebKit stays deliberately narrow. It exists for cross-browser smoke
        // coverage, and the other specs have never been validated against it —
        // widening it here would trade a real gate for unrelated WebKit noise.
        {
          name: "mobile-webkit",
          use: { ...devices["iPhone 13"], browserName: "webkit" },
          testMatch: /smoke\.spec\.ts/,
        },
      ]
    : [
        {
          name: "desktop",
          use: { ...devices["Desktop Chrome"], browserName: "chromium" },
        },
        {
          name: "tablet",
          use: { ...devices["iPad (gen 7)"], browserName: "chromium" },
        },
        {
          name: "mobile",
          use: { ...devices["iPhone 13"], browserName: "chromium" },
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
