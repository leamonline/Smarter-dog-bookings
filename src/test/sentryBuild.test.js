import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../vite.config.js";
import { removeSourceMaps, resolveSentryBuild } from "../../vite.sentry.js";

const FULL = {
  SENTRY_AUTH_TOKEN: "fake-token-for-tests",
  SENTRY_ORG: "an-org",
  SENTRY_PROJECT: "a-project",
  VERCEL_GIT_COMMIT_SHA: "abc1234",
};

describe("resolveSentryBuild", () => {
  it("does nothing without credentials: no plugins, no maps", () => {
    const out = resolveSentryBuild({ VERCEL_GIT_COMMIT_SHA: "abc1234" });
    expect(out.upload).toBe(false);
    expect(out.plugins).toEqual([]);
    expect(out.sourcemap).toBe(false);
    // The release tag is still available to the SDK on any Vercel build.
    expect(out.release).toBe("abc1234");
  });

  it("needs every one of token, org, project and a release", () => {
    for (const missing of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT", "VERCEL_GIT_COMMIT_SHA"]) {
      const env = { ...FULL };
      delete env[missing];
      const out = resolveSentryBuild(env);
      expect(out.upload, `without ${missing}`).toBe(false);
      expect(out.sourcemap, `without ${missing}`).toBe(false);
      expect(out.plugins, `without ${missing}`).toEqual([]);
    }
  });

  it("with everything present, builds hidden maps and uploads them, then cleans up", () => {
    const out = resolveSentryBuild(FULL);
    expect(out.upload).toBe(true);
    // "hidden" = maps exist for the upload but the bundle never points at them.
    expect(out.sourcemap).toBe("hidden");
    const names = out.plugins.map((p) => p.name);
    expect(names.at(-1)).toBe("smarterdog-remove-source-maps");
    expect(names.length).toBe(2);
  });

  it("prefers an explicit VITE_SENTRY_RELEASE over the commit sha", () => {
    expect(resolveSentryBuild({ ...FULL, VITE_SENTRY_RELEASE: "manual-1" }).release).toBe("manual-1");
  });
});

describe("removeSourceMaps", () => {
  it("deletes every .map file and leaves the bundle alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "sdb-maps-"));
    try {
      mkdirSync(join(dir, "app", "assets"), { recursive: true });
      writeFileSync(join(dir, "app", "assets", "index-1.js"), "x");
      writeFileSync(join(dir, "app", "assets", "index-1.js.map"), "{}");
      writeFileSync(join(dir, "app", "assets", "sentry-2.js.map"), "{}");

      removeSourceMaps(dir).closeBundle();

      expect(existsSync(join(dir, "app", "assets", "index-1.js"))).toBe(true);
      expect(existsSync(join(dir, "app", "assets", "index-1.js.map"))).toBe(false);
      expect(existsSync(join(dir, "app", "assets", "sentry-2.js.map"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("vite config in an ordinary build", () => {
  it("emits no source maps and tags no plugins when no Sentry credentials are present", () => {
    // Tests run without SENTRY_* in the environment (CI has none).
    expect(config.build.sourcemap).toBe(false);
    expect(config.plugins.flat().some((p) => p?.name === "smarterdog-remove-source-maps")).toBe(false);
  });

  it("keeps the service worker out of the hidden-map setting", () => {
    // vite-plugin-pwa follows build.sourcemap unless told otherwise, which
    // would leave a dangling sourceMappingURL in sw.js once the maps are
    // deleted. The option lives in the config literal, so pin it there.
    const source = readFileSync(new URL("../../vite.config.js", import.meta.url), "utf8");
    expect(source).toMatch(/workbox:\s*\{[\s\S]*?sourcemap:\s*false/);
  });

  it("defines the release the SDK reads", () => {
    expect(config.define).toHaveProperty("import.meta.env.VITE_SENTRY_RELEASE");
  });
});
