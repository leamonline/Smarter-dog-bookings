import { defineConfig, devices } from "@playwright/test";

// Standalone config for the Daily Brief UX review captures.
// Reuses an already-running `VITE_FORCE_OFFLINE=1 vite preview` on :4173.
export default defineConfig({
  testDir: ".",
  testMatch: /daily-brief-review\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    ...devices["Desktop Chrome"],
    // This repo pins @playwright/test 1.62.1, whose bundled Chromium build
    // (1234) is not present in this container; build 1194 is. Point at the
    // pre-installed full Chromium rather than downloading a second browser.
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    },
  },
});
