import { defineConfig, devices } from "@playwright/test";
import { readLocalStack } from "./scripts/customer-e2e/localStack.mjs";
import { CUSTOMER_E2E_ORIGIN, CUSTOMER_E2E_PORT } from "./scripts/customer-e2e/localTarget.mjs";

// Customer journey tests: the real customer portal against a disposable LOCAL
// Supabase stack carrying every committed migration. Nothing here is faked:
// sign-in goes through the local auth server and every booking, cancellation
// and reschedule goes through the same database functions and gates as
// production. See docs/customer-journey-tests.md.
//
// readLocalStack() refuses any target that is not this machine, so this
// config cannot be pointed at staging or production by a stray env file.
const stack = readLocalStack();

const PORT = CUSTOMER_E2E_PORT;
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e-customer",
  // One shared database, reset between tests: never run them side by side.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["line"], ["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e-customer/support/globalSetup.ts",
  use: {
    baseURL: CUSTOMER_E2E_ORIGIN,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "customer-phone",
      use: {
        ...devices["Pixel 7"],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  webServer: {
    // Plain Vite, not `npm run dev`: that launcher forces sample-data mode.
    // An explicit process env wins over any .env file, so a developer's
    // .env.local (which usually names production) cannot leak in.
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${CUSTOMER_E2E_ORIGIN}/book`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: stack.apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: stack.anonKey,
      VITE_SUPABASE_ANON_KEY: stack.anonKey,
      VITE_FORCE_OFFLINE: "",
      // Cloudflare's published always-pass test key, set explicitly: a real
      // key from a developer's environment would otherwise win and could
      // refuse this address or demand interaction (src/lib/turnstile.ts).
      VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      VITE_SENTRY_DSN: "",
      VITE_POSTHOG_KEY: "",
    },
  },
});
