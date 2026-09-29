// `npm run dev` must not be a production client by default (#875).
//
// A normal .env.local holds production credentials, and plain `vite` used
// them, so a dev session could read real customers and send real messages.
// These tests pin the default to sample data and keep `dev:live` the only,
// explicit, way to connect.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIVE_FLAG, resolveDevLaunch } from "../../scripts/dev.mjs";
import { devConnectedProjectRef } from "../supabase/devConnection";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("npm run dev", () => {
  it("goes through the wrapper, and dev:live is the only opt-in", () => {
    expect(pkg.scripts.dev).toBe("node scripts/dev.mjs");
    expect(pkg.scripts["dev:live"]).toBe(`node scripts/dev.mjs ${LIVE_FLAG}`);
  });

  it("forces sample data by default, even with production credentials in the environment", () => {
    const { live, env, viteArgs } = resolveDevLaunch(["--port", "5173"], {
      VITE_SUPABASE_URL: "https://nlzhllhkigmsvrzduefz.supabase.co",
    });
    expect(live).toBe(false);
    expect(env.VITE_FORCE_OFFLINE).toBe("1");
    expect(viteArgs).toEqual(["--port", "5173"]);
  });

  it("connects only when --live is passed, and strips the flag from vite's arguments", () => {
    const { live, env, viteArgs } = resolveDevLaunch([LIVE_FLAG, "--host"], { VITE_FORCE_OFFLINE: "1" });
    expect(live).toBe(true);
    expect(env.VITE_FORCE_OFFLINE).toBeUndefined();
    expect(viteArgs).toEqual(["--host"]);
  });
});

describe("devConnectedProjectRef", () => {
  const url = "https://nlzhllhkigmsvrzduefz.supabase.co";

  it("names the hosted project a live dev session is connected to", () => {
    expect(devConnectedProjectRef({ dev: true, forceOffline: false, supabaseUrl: url })).toBe(
      "nlzhllhkigmsvrzduefz",
    );
  });

  it("names a non-hosted stack by its host", () => {
    expect(
      devConnectedProjectRef({ dev: true, forceOffline: false, supabaseUrl: "http://127.0.0.1:54321" }),
    ).toBe("127.0.0.1");
  });

  it.each([
    ["a production build", { dev: false, forceOffline: false, supabaseUrl: url }],
    ["sample data", { dev: true, forceOffline: true, supabaseUrl: url }],
    ["no credentials", { dev: true, forceOffline: false, supabaseUrl: undefined }],
  ])("stays silent for %s", (_label, input) => {
    expect(devConnectedProjectRef(input)).toBeNull();
  });
});
