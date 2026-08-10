import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/verify-whatsapp-reschedule-concurrency.sh";
const capacityScript = "scripts/verify-capacity-concurrency.sh";
const concurrencyDriver = join(
  process.cwd(),
  "scripts/postgres-concurrency-driver.sh",
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

function runDriverProbe(
  fakePsqlBody: string,
  probeBody: string,
  timeout = 10_000,
) {
  const stubRoot = mkdtempSync(join(tmpdir(), "postgres-concurrency-driver."));
  const fakePsql = join(stubRoot, "fake-psql");
  const outputFile = join(stubRoot, "client.out");

  try {
    writeFileSync(fakePsql, `#!/usr/bin/env bash\n${fakePsqlBody}\n`, {
      mode: 0o755,
    });

    const startedAt = Date.now();
    const result = spawnSync(
      "/bin/bash",
      ["-c", probeBody, "bash", concurrencyDriver, fakePsql, outputFile],
      {
        encoding: "utf8",
        timeout,
      },
    );
    return { ...result, elapsedMs: Date.now() - startedAt };
  } finally {
    rmSync(stubRoot, { recursive: true, force: true });
  }
}

describe("the destructive reschedule concurrency gate", () => {
  it("shares the guarded PostgreSQL driver with the capacity race", () => {
    for (const scenarioScript of [script, capacityScript]) {
      const source = readFileSync(scenarioScript, "utf8");
      expect(source).toContain(
        'source "$SCRIPT_DIR/postgres-concurrency-driver.sh"',
      );
      expect(source).toContain("concurrency_init_local_supabase");
      expect(source).toContain("concurrency_terminate_named_backends");
    }
  });

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
          concurrencyDriver,
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

describe("the shared PostgreSQL concurrency driver", () => {
  it("starts a stoppable watchdog without caller EXIT cleanup", () => {
    const result = runDriverProbe(
      "exit 0",
      `set -euo pipefail
source "$1"
watchdog_entered="$3.watchdog-entered"
watchdog_exit_trap="$3.watchdog-exit-trap"
parent_exit_cleared="$3.parent-exit-cleared"
root_subshell=$BASH_SUBSHELL

cleanup_probe() { :; }
builtin trap cleanup_probe EXIT

# Force the watchdog child to pause before its first production command, record
# the EXIT trap it began with, then let the parent stop it deterministically.
set -T
trap '
  if [ "$BASH_SUBSHELL" = "$root_subshell" ] &&
     [ "$BASH_COMMAND" = "trap - EXIT" ]; then
    touch "$parent_exit_cleared"
  elif [ "$BASH_SUBSHELL" != "$root_subshell" ] &&
       [[ "$BASH_COMMAND" != *"trap -p EXIT"* ]] &&
       [ ! -e "$watchdog_entered" ]; then
    if [ ! -e "$parent_exit_cleared" ]; then
      builtin trap cleanup_probe EXIT
    fi
    builtin trap -p EXIT > "$watchdog_exit_trap"
    touch "$watchdog_entered"
    while :; do sleep 0.05; done
  fi
' DEBUG
concurrency_start_watchdog "$$" 30 "pre-initialisation watchdog"
watchdog_pid=$CONCURRENCY_WATCHDOG_PID

for ((attempt = 1; attempt <= 100; attempt++)); do
  [ -e "$watchdog_entered" ] && break
  sleep 0.01
done
[ -e "$watchdog_entered" ]
kill -KILL "$watchdog_pid"
wait "$watchdog_pid" 2>/dev/null || true
trap - DEBUG

if [ -s "$watchdog_exit_trap" ]; then
  echo "watchdog inherited the caller EXIT cleanup" >&2
  exit 92
fi

if [ -e "$parent_exit_cleared" ]; then
  printf 'parent_exit_cleared=yes\n'
else
  printf 'parent_exit_cleared=no\n'
fi
trap - EXIT
printf 'watchdog_exit_trap=absent\n'`,
    );

    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("parent_exit_cleared=yes");
    expect(result.stdout).toContain("watchdog_exit_trap=absent");
    expect(result.stderr).not.toContain("No record of process");
  });

  it("bounds and reaps a psql client that outlives its database backend", () => {
    const result = runDriverProbe(
      `if [ -z "\${PGAPPNAME:-}" ]; then
  printf '0\\n'
  exit 0
fi
trap '' TERM
exec sleep 30`,
      `set -euo pipefail
source "$1"
CONCURRENCY_PSQL=("$2")
CONCURRENCY_TERM_GRACE_SECONDS=1
client_pid=""
cleanup_probe() {
  if [ -n "$client_pid" ]; then
    kill -KILL "$client_pid" 2>/dev/null || true
    wait "$client_pid" 2>/dev/null || true
  fi
}
trap cleanup_probe EXIT

concurrency_start_psql_session fake_stuck_client "$3" "select 1"
client_pid=$CONCURRENCY_SESSION_PID
concurrency_wait_for_named_backends 1 0.1 fake_stuck_client

set +e
concurrency_reap_psql_session "$client_pid" 1 "fake stuck psql"
client_status=$?
set -e

if kill -0 "$client_pid" 2>/dev/null; then
  echo "client survived bounded reap" >&2
  exit 91
fi
concurrency_psql_pid_is_reaped "$client_pid"
printf 'client_status=%s reaped=yes\\n' "$client_status"
client_pid=""
trap - EXIT

[ "$client_status" -eq 137 ]`,
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("client_status=137 reaped=yes");
    expect(result.stderr).toContain("fake stuck psql exceeded 1s");
    expect(result.stderr).toContain("did not exit within 1s of TERM");
  });

  it("preserves the genuine non-zero exit status of a reaped psql client", () => {
    const result = runDriverProbe(
      "exit 23",
      `set -euo pipefail
source "$1"
CONCURRENCY_PSQL=("$2")
concurrency_start_psql_session fake_failed_client "$3" "select 1"
client_pid=$CONCURRENCY_SESSION_PID
exit_trap_marker="$3.exit-trap"
trap 'printf inherited > "$exit_trap_marker"' EXIT

set +e
concurrency_reap_psql_session "$client_pid" 5 "fake failed psql"
client_status=$?
set -e
if [ -e "$exit_trap_marker" ]; then
  echo "watchdog ran the caller EXIT trap" >&2
  exit 93
fi
trap - EXIT
printf 'client_status=%s\\n' "$client_status"
[ "$client_status" -eq 23 ]`,
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("client_status=23");
    expect(result.elapsedMs).toBeLessThan(2_500);
  });

  it("tracks and reaps every psql client during cleanup", () => {
    const result = runDriverProbe(
      `trap '' TERM
exec sleep 30`,
      `set -euo pipefail
source "$1"
CONCURRENCY_PSQL=("$2")
CONCURRENCY_TERM_GRACE_SECONDS=1

concurrency_start_psql_session fake_cleanup_one "$3.one" "select 1"
first_pid=$CONCURRENCY_SESSION_PID
concurrency_start_psql_session fake_cleanup_two "$3.two" "select 1"
second_pid=$CONCURRENCY_SESSION_PID
concurrency_cleanup_tracked_psql_sessions

for client_pid in "$first_pid" "$second_pid"; do
  if kill -0 "$client_pid" 2>/dev/null; then
    echo "tracked client survived cleanup: $client_pid" >&2
    exit 92
  fi
  concurrency_psql_pid_is_reaped "$client_pid"
done
printf 'tracked_clients_reaped=2\\n'`,
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("tracked_clients_reaped=2");
  });
});
