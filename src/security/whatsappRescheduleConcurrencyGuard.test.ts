import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/verify-whatsapp-reschedule-concurrency.sh";
const concurrencyHelpers = join(
  process.cwd(),
  "scripts/whatsapp-reschedule-concurrency-helpers.sh",
);

function runGate(overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };
  for (
    const name of [
      "CONCURRENCY_LOCAL_STACK_CONFIRMED",
      "PGHOSTADDR",
      "PGSERVICE",
      "PGSERVICEFILE",
      "PGSYSCONFDIR",
    ]
  ) {
    delete env[name];
  }
  Object.assign(env, overrides);
  return spawnSync("bash", [script], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
}

describe("the destructive reschedule concurrency gate", () => {
  it("recognizes the expected staff failure when ripgrep is unavailable", () => {
    const stubRoot = mkdtempSync(join(tmpdir(), "wa-reschedule-output-check."));
    const outputFile = join(stubRoot, "membership-staff.out");
    try {
      const grepLookup = spawnSync("/bin/sh", ["-c", "command -v grep"], {
        encoding: "utf8",
      });
      expect(grepLookup.status).toBe(0);
      symlinkSync(grepLookup.stdout.trim(), join(stubRoot, "grep"));
      writeFileSync(
        outputFile,
        "ERROR: P0001: booking_visit_already_cancelled\n",
      );

      const env = { PATH: stubRoot };
      const rgLookup = spawnSync("/bin/sh", ["-c", "command -v rg"], {
        env,
        encoding: "utf8",
      });
      expect(rgLookup.status).not.toBe(0);

      const result = spawnSync(
        "/bin/bash",
        [
          "-c",
          'set -e; source "$1"; file_contains_fixed_string "$2" "$3"',
          "bash",
          concurrencyHelpers,
          "booking_visit_already_cancelled",
          outputFile,
        ],
        {
          env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
    } finally {
      rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("refuses to start without an explicit local-stack opt-in", () => {
    const result = runGate({
      PSQL_BIN: "psql-must-not-be-checked-before-opt-in",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("CONCURRENCY_LOCAL_STACK_CONFIRMED=1");
    expect(result.stderr).not.toContain("PostgreSQL client");
  });

  it("rejects a connection identity that differs from the local Supabase defaults", () => {
    const result = runGate({
      CONCURRENCY_LOCAL_STACK_CONFIRMED: "1",
      PGHOST: "localhost",
      PSQL_BIN: "psql-must-not-be-checked-before-identity",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("exact local Supabase connection identity");
    expect(result.stderr).not.toContain("PostgreSQL client");
  });

  it("requires this checkout's Supabase stack to be running before psql is invoked", () => {
    const stubRoot = mkdtempSync(join(tmpdir(), "wa-reschedule-guard."));
    const psqlMarker = join(stubRoot, "psql-invoked");
    try {
      writeFileSync(
        join(stubRoot, "supabase"),
        "#!/usr/bin/env bash\nexit 1\n",
        { mode: 0o755 },
      );
      writeFileSync(
        join(stubRoot, "psql"),
        `#!/usr/bin/env bash\ntouch ${JSON.stringify(psqlMarker)}\nexit 1\n`,
        { mode: 0o755 },
      );

      const result = runGate({
        CONCURRENCY_LOCAL_STACK_CONFIRMED: "1",
        PGHOST: "127.0.0.1",
        PGPORT: "54322",
        PGDATABASE: "postgres",
        PGUSER: "postgres",
        PGPASSWORD: "postgres",
        PSQL_BIN: "psql",
        PATH: `${stubRoot}:${process.env.PATH ?? ""}`,
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("supabase status");
      expect(existsSync(psqlMarker)).toBe(false);
    } finally {
      rmSync(stubRoot, { recursive: true, force: true });
    }
  });

  it("rejects libpq connection indirection before Supabase status or psql", () => {
    const stubRoot = mkdtempSync(join(tmpdir(), "wa-reschedule-indirection."));
    const statusMarker = join(stubRoot, "supabase-status-invoked");
    const psqlMarker = join(stubRoot, "psql-invoked");
    try {
      writeFileSync(
        join(stubRoot, "supabase"),
        `#!/usr/bin/env bash\ntouch ${JSON.stringify(statusMarker)}\nexit 0\n`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(stubRoot, "psql"),
        `#!/usr/bin/env bash\ntouch ${JSON.stringify(psqlMarker)}\nexit 1\n`,
        { mode: 0o755 },
      );

      const result = runGate({
        CONCURRENCY_LOCAL_STACK_CONFIRMED: "1",
        PGHOST: "127.0.0.1",
        PGHOSTADDR: "203.0.113.10",
        PGPORT: "54322",
        PGDATABASE: "postgres",
        PGUSER: "postgres",
        PGPASSWORD: "postgres",
        PSQL_BIN: "psql",
        PATH: `${stubRoot}:${process.env.PATH ?? ""}`,
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("libpq connection indirection");
      expect(existsSync(statusMarker)).toBe(false);
      expect(existsSync(psqlMarker)).toBe(false);
    } finally {
      rmSync(stubRoot, { recursive: true, force: true });
    }
  });
});
