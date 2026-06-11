import { defineConfig, devices } from "@playwright/test";

// Boot-probe config: the waterfall regression guard (e2e-bootprobe/).
//
// Unlike the main suite (playwright.config.ts, VITE_FORCE_OFFLINE=1), this
// build is wired to a stub Supabase project URL so the app boots ONLINE.
// The spec seeds a fake session in localStorage and intercepts every
// https://stub.supabase.test request with page.route, then asserts the boot
// request ORDER: tier-1 data queries must be in flight before the
// staff-profile fetch resolves, and the directory page-0 RPCs must stay off
// the boot path.
//
// Run with: npm run e2e:bootprobe

const PORT = Number(process.env.PLAYWRIGHT_BOOTPROBE_PORT) || 4174;
const baseURL =
  process.env.PLAYWRIGHT_BOOTPROBE_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e-bootprobe",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The PWA service worker must not sit between the page and page.route —
    // this suite asserts on raw network request timing.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    env: {
      VITE_SUPABASE_URL: "https://stub.supabase.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "stub-publishable",
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
