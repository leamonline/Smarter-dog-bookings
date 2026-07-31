// The test suite must never be able to reach production Supabase.
//
// A developer's .env.local holds real VITE_SUPABASE_* credentials, and Vitest
// loads .env files exactly like Vite does. Without a guard, the test run would
// build a live client and open a real realtime websocket against production —
// with real customer data behind it.
//
// The guard lives in vitest.config.ts, which sets VITE_FORCE_OFFLINE=1 on every
// project. That is committed, so it covers every invocation (npm test,
// test:watch, coverage, IDE runners, a bare `vitest`) rather than relying on an
// untracked .env.test.local that can silently go missing — which is exactly how
// this protection was lost before.
//
// This file makes the guard self-enforcing: it fails if the running process is
// not offline, and it fails if a future edit drops the setting from any project.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("offline test guard", () => {
  it("runs this very process in offline mode", () => {
    // The strongest form of the check: not "the config looks right" but "the
    // process executing this assertion is offline".
    expect(import.meta.env.VITE_FORCE_OFFLINE).toBe("1");
  });

  it("builds no Supabase client, so nothing can reach production", async () => {
    const { supabase, supabaseConfigError } = await import("./client");
    expect(supabase).toBeNull();
    // Offline is deliberate in tests, not a broken deploy.
    expect(supabaseConfigError).toBeNull();
  });

  it("forces offline for every vitest project, not just one", () => {
    const config = readFileSync("vitest.config.ts", "utf8");

    // Every declared project must carry the offline env.
    const projectCount = (config.match(/\bname:\s*["']/g) ?? []).length;
    const offlineCount = (config.match(/\benv:\s*offlineEnv\b/g) ?? []).length;

    expect(projectCount).toBeGreaterThanOrEqual(2);
    expect(offlineCount).toBe(projectCount);
    expect(config).toMatch(/const offlineEnv = \{\s*VITE_FORCE_OFFLINE: "1"\s*\}/);
  });
});
