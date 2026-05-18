import { defineConfig, devices } from "@playwright/test";

// Playwright config for Smarter Dog Bookings E2E.
//
// The dev server runs with VITE_FORCE_OFFLINE=1 so tests exercise the
// deterministic sample dataset and don't depend on a live Supabase project.
//
// Browser pinning: every project runs on Chromium so a single
// `playwright install chromium` in CI is enough. The iPad / iPhone
// profiles still give us mobile viewport + touch coverage; we trade
// pure Webkit rendering for simpler CI provisioning, which is the
// right call for a launch smoke suite.

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 4173;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

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
    trace: "retain-on-failure",
  },
  projects: [
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
    env: { VITE_FORCE_OFFLINE: "1" },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
