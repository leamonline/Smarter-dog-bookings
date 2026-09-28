// A Vercel build must bake in the right data source (#875): previews on sample
// data, production never. The guard runs first in scripts/build-combined.mjs,
// which is Vercel's buildCommand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewDataGuard } from "../../scripts/lib/preview-guard.mjs";

describe("previewDataGuard", () => {
  it("refuses a preview that would connect to production", () => {
    expect(previewDataGuard({ VERCEL_ENV: "preview" })).toMatch(/PREVIEW.*VITE_FORCE_OFFLINE=1/s);
    expect(previewDataGuard({ VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "0" })).not.toBeNull();
  });

  it("allows a preview on sample data", () => {
    expect(previewDataGuard({ VERCEL_ENV: "preview", VITE_FORCE_OFFLINE: "1" })).toBeNull();
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
    expect(guard).toBeLessThan(script.indexOf('run("npm", ["run", "build"])'));
  });
});
