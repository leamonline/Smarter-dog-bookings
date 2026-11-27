// A Vercel build must bake in the right data source (#875): previews on sample
// data, production never. The guard runs first in scripts/build-combined.mjs,
// which is Vercel's buildCommand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combinedBuildEnvironment, previewDataGuard } from "../../scripts/lib/preview-guard.mjs";

describe("previewDataGuard", () => {
  it("refuses a preview that would connect to production", () => {
    expect(previewDataGuard({ VERCEL_ENV: "preview" })).toMatch(/PREVIEW.*VITE_FORCE_OFFLINE=1/s);
    expect(previewDataGuard({ VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "0" })).not.toBeNull();
  });

  it("says what it saw, so an unset variable and a wrong value can be told apart", () => {
    expect(previewDataGuard({ VERCEL_ENV: "preview" })).toContain("not set for this build");
    expect(previewDataGuard({ VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "true" })).toContain('is "true", not "1"');
  });

  it("allows a preview on sample data", () => {
    expect(previewDataGuard({ VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "1" })).toBeNull();
  });

  it("refuses stale build output reuse in Preview", () => {
    expect(previewDataGuard({
      VERCEL_ENV: "preview",
      VITE_FORCE_OFFLINE: "1",
      SKIP_BUILDS: "1",
    })).toMatch(/reuse existing build output/);
  });

  it("refuses a production build that would serve sample data", () => {
    expect(previewDataGuard({ VERCEL_ENV: "production", VITE_FORCE_OFFLINE: "1" })).toMatch(/PRODUCTION/);
  });

  it("allows a normal production build", () => {
    expect(previewDataGuard({ VERCEL_ENV: "production" })).toBeNull();
  });

  it("stays out of the way outside Vercel (local, CI, Playwright)", () => {
    expect(previewDataGuard({})).toBeNull();
    expect(previewDataGuard({ VITE_FORCE_OFFLINE: "1" })).toBeNull();
  });

  it("runs before either app is built, in the script Vercel actually runs", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(vercel.buildCommand).toBe("node scripts/build-combined.mjs");
    const script = readFileSync("scripts/build-combined.mjs", "utf8");
    const guard = script.indexOf("previewDataGuard(process.env)");
    expect(guard).toBeGreaterThan(-1);
    const buildEnv = script.indexOf("combinedBuildEnvironment(process.env)");
    expect(buildEnv).toBeGreaterThan(guard);
    expect(script).toContain('execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: buildEnv })');
    expect(buildEnv).toBeLessThan(script.indexOf('run("npm", ["run", "website:build"])'));
    expect(buildEnv).toBeLessThan(script.indexOf('run("npm", ["run", "build"])'));
  });
});

describe("combinedBuildEnvironment", () => {
  const bindings = {
    VITE_SUPABASE_URL: "https://synthetic-preview-target.invalid",
    VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    VITE_SUPABASE_ANON_KEY: "synthetic-anon-key",
  };

  it("clears all hosted client bindings and preserves sample mode for both apps", () => {
    const inherited = { ...bindings, VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "1" };

    expect(combinedBuildEnvironment(inherited)).toEqual({
      ...inherited,
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_ANON_KEY: "",
    });
    expect(inherited).toMatchObject(bindings);
  });

  it("explicitly overrides fallback Vite env files", () => {
    expect(combinedBuildEnvironment({ VERCEL_ENV: "preview" })).toEqual({
      VERCEL_ENV: "preview",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_ANON_KEY: "",
    });
  });

  it.each(["production", undefined])("keeps normal %s builds unchanged", (environment) => {
    const env = { ...bindings, VERCEL_ENV: environment };
    expect(combinedBuildEnvironment(env)).toBe(env);
  });
});
