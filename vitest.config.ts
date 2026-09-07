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
    // Coverage ratchet (assessment item 1.8). Thresholds sit a point or two
    // under the measured level on 1 September 2026 (engine 96.1 / 88.0 /
    // 95.8 / 97.4; repositories 73.6 / 75.7 / 81.7 / 77.6 — statements /
    // branches / functions / lines) so coverage cannot fall silently on the
    // two directories that own the booking rules and the DB boundary. Raise
    // a threshold when the measured figure moves up; never lower one to get
    // green — fix the coverage instead. Enforced by the `coverage` CI job.
    coverage: {
      provider: "v8",
      include: ["src/engine/**", "src/supabase/repositories/**"],
      exclude: ["**/*.test.*", "**/*.d.ts", "src/engine/capacityParityFixtures.ts"],
      reporter: ["text-summary"],
      thresholds: {
        "src/engine/**": { statements: 95, branches: 86, functions: 94, lines: 96 },
        "src/supabase/repositories/**": { statements: 72, branches: 74, functions: 80, lines: 76 },
      },
    },
    projects: [
      {
        test: {
          name: "logic",
          globals: true,
          environment: "node",
          env: offlineEnv,
          include: ["src/**/*.test.{js,ts}"],
          // website/** is an independent application with its own Vitest
          // config (ADR 009); never let root discovery reach it.
          exclude: ["src/**/*.component.test.{jsx,tsx}", "website/**"],
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
          exclude: ["**/node_modules/**", "website/**"],
          setupFiles: ["./src/test/componentSetup.ts"],
        },
      },
    ],
  },
});
