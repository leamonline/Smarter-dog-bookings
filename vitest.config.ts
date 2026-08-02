import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Force the whole test suite into offline/sample-data mode so it can NEVER reach
// production Supabase. CI runs credential-less, but a developer's .env.local (real
// VITE_SUPABASE_* creds) is loaded by Vitest exactly like Vite — which would
// otherwise build a live client and open a real realtime websocket during tests.
// src/supabase/client.js treats VITE_FORCE_OFFLINE=1 as "no creds → supabase = null".
// Applied per-project so every invocation (npm test, test:watch, coverage, IDE,
// direct `vitest`) is covered, not just `npm run test`.
const offlineEnv = { VITE_FORCE_OFFLINE: "1" };

export default defineConfig({
  test: {
    // Keep jsdom workers within the memory available on local and CI runners.
    // Unbounded parallelism causes unrelated component tests to hit timeouts.
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "logic",
          globals: true,
          environment: "node",
          env: offlineEnv,
          include: ["src/**/*.test.{js,ts}"],
          exclude: ["src/**/*.component.test.{jsx,tsx}"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "component",
          globals: true,
          environment: "jsdom",
          env: offlineEnv,
          include: ["src/**/*.component.test.{jsx,tsx}"],
          setupFiles: ["./src/test/componentSetup.ts"],
        },
      },
    ],
  },
});
