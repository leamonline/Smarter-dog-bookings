// Guards scripts/lib/load-env-local.mjs — the hand-rolled `.env.local` parser
// shared by scripts/check-captcha-live.mjs and scripts/seed-first-owner.mjs,
// the latter of which handles the Supabase service-role key (RLS bypass —
// effectively root). It was extracted from two scripts so they could share
// it, but had no test of its own.
//
// Two behaviours here are easy to get wrong silently, and both are the kind
// of bug that only shows up as a confusing runtime symptom days later:
//
//   - The split is on the FIRST "=" only. A naive `split("=")` would mangle
//     any value that itself contains "=" — a base64 key ending in "==", or a
//     Postgres connection string with "?options=...". Get this wrong and a
//     service-role key silently loads truncated, and the script that uses it
//     fails with an auth error that points nowhere near the real cause.
//   - An existing `process.env` value must WIN over the file. This is what
//     lets shell env and CLI flags override `.env.local` on purpose. Get
//     this backwards and a developer's exported override is silently
//     replaced by a stale file value.
//
// It also has to fail soft: a missing file, a malformed line, or a line with
// no "=" at all must never throw, because `.env.local` is hand-edited and
// these scripts are meant to still run without it.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvLocal } from "../../scripts/lib/load-env-local.mjs";

// Namespaced so a collision with a real env var is vanishingly unlikely, and
// snapshotted/restored per test so a leaked value can never affect another
// test in this process (loadEnvLocal mutates process.env directly).
const TEST_KEYS = [
  "LOAD_ENV_LOCAL_TEST_A",
  "LOAD_ENV_LOCAL_TEST_B",
  "LOAD_ENV_LOCAL_TEST_C",
  "LOAD_ENV_LOCAL_TEST_D",
  "LOAD_ENV_LOCAL_TEST_E",
  "LOAD_ENV_LOCAL_TEST_EXISTING",
];

let tempDir: string | undefined;
const savedEnv = new Map<string, string | undefined>();

function rememberEnv(key: string) {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
}

// Writes `contents` to a fixture file in a fresh temp directory and returns
// its path. Never touches the repository, so there is no risk of this test
// ever creating a real `.env.local`.
function writeFixture(contents: string): string {
  tempDir = mkdtempSync(path.join(tmpdir(), "load-env-local-test-"));
  const fixturePath = path.join(tempDir, "fixture.env");
  writeFileSync(fixturePath, contents, "utf8");
  return fixturePath;
}

afterEach(() => {
  for (const key of TEST_KEYS) {
    rememberEnv(key); // in case a test set one without going through the helper
    const original = savedEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  savedEnv.clear();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("loadEnvLocal", () => {
  it("sets process.env from a KEY=value line", () => {
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    const envPath = writeFixture("LOAD_ENV_LOCAL_TEST_A=hello\n");

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("hello");
  });

  it("skips blank lines and comment lines", () => {
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    rememberEnv("LOAD_ENV_LOCAL_TEST_B");
    const envPath = writeFixture(
      [
        "# a comment above the first real line",
        "",
        "LOAD_ENV_LOCAL_TEST_A=one",
        "   ",
        "# LOAD_ENV_LOCAL_TEST_B=should-not-be-set",
        "",
      ].join("\n"),
    );

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("one");
    expect(process.env.LOAD_ENV_LOCAL_TEST_B).toBeUndefined();
  });

  it("splits on the first = only, so a value containing = survives intact", () => {
    // Dummy values shaped like the real things that would break here: a
    // base64-padded key and a connection string with its own query string.
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    rememberEnv("LOAD_ENV_LOCAL_TEST_B");
    const envPath = writeFixture(
      [
        "LOAD_ENV_LOCAL_TEST_A=dGVzdC12YWx1ZQ==",
        "LOAD_ENV_LOCAL_TEST_B=postgres://user:pass@host:5432/db?options=-csearch_path=app",
      ].join("\n"),
    );

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("dGVzdC12YWx1ZQ==");
    expect(process.env.LOAD_ENV_LOCAL_TEST_B).toBe(
      "postgres://user:pass@host:5432/db?options=-csearch_path=app",
    );
  });

  it("trims whitespace around the key and value", () => {
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    const envPath = writeFixture("   LOAD_ENV_LOCAL_TEST_A   =   spaced value   \n");

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("spaced value");
  });

  it("strips one layer of surrounding single or double quotes", () => {
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    rememberEnv("LOAD_ENV_LOCAL_TEST_B");
    const envPath = writeFixture(
      [
        'LOAD_ENV_LOCAL_TEST_A="double quoted"',
        "LOAD_ENV_LOCAL_TEST_B='single quoted'",
      ].join("\n"),
    );

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("double quoted");
    expect(process.env.LOAD_ENV_LOCAL_TEST_B).toBe("single quoted");
  });

  it("never overwrites a value already set in process.env", () => {
    // This is what lets shell env and CLI flags beat the file. If this
    // regresses, a developer's deliberate override gets silently replaced.
    rememberEnv("LOAD_ENV_LOCAL_TEST_EXISTING");
    process.env.LOAD_ENV_LOCAL_TEST_EXISTING = "from-shell";
    const envPath = writeFixture("LOAD_ENV_LOCAL_TEST_EXISTING=from-file\n");

    loadEnvLocal({ envPath });

    expect(process.env.LOAD_ENV_LOCAL_TEST_EXISTING).toBe("from-shell");
  });

  it("swallows a missing file rather than throwing", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "load-env-local-test-"));
    const missingPath = path.join(tempDir, "does-not-exist.env");

    expect(() => loadEnvLocal({ envPath: missingPath })).not.toThrow();
  });

  it("skips a line with no = at all without throwing", () => {
    rememberEnv("LOAD_ENV_LOCAL_TEST_A");
    rememberEnv("LOAD_ENV_LOCAL_TEST_C");
    const envPath = writeFixture(
      ["this line has no equals sign", "LOAD_ENV_LOCAL_TEST_A=one"].join("\n"),
    );

    expect(() => loadEnvLocal({ envPath })).not.toThrow();
    expect(process.env.LOAD_ENV_LOCAL_TEST_A).toBe("one");
    expect(process.env.LOAD_ENV_LOCAL_TEST_C).toBeUndefined();
  });
});
