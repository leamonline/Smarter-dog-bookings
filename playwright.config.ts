import { defineConfig, devices } from "@playwright/test";

// Playwright config for Smarter Dog Bookings E2E.
//
// The dev server runs with VITE_FORCE_OFFLINE=1 so tests exercise the
// deterministic sample dataset and don't depend on a live Supabase project.
//
// The full post-merge matrix deliberately remains Chromium-only: it provides
// desktop, tablet and mobile viewport coverage at its established cost. The
// pull-request gate opts into the smaller, production-build `pr-smoke` matrix
// below so it adds real mobile WebKit coverage without changing that matrix.

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
        {
          name: "mobile-webkit",
          use: { ...devices["iPhone 13"], browserName: "webkit" },
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
