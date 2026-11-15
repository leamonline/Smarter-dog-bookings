import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/ensure-linked-session-pooler.sh");

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
const stagingRef = "btjnxvgkpdbfrrqxvkfj";
const token = "staging-token-should-not-be-logged";
const plantedPassword = "super-secret-db-password";

function run(body: unknown, status: string, options?: { existingPooler?: string; linkedRef?: string }) {
  const root = mkdtempSync(join(tmpdir(), "pooler-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, "supabase/.temp"), { recursive: true });
  writeFileSync(join(root, "supabase/.temp/project-ref"), options?.linkedRef ?? stagingRef);
  if (options?.existingPooler !== undefined) {
    writeFileSync(join(root, "supabase/.temp/pooler-url"), options.existingPooler);
  }
  const bodyFile = join(root, "body.json");
  writeFileSync(bodyFile, typeof body === "string" ? body : JSON.stringify(body));
  const argsLog = join(root, "curl.args");
  writeFileSync(argsLog, "");
  writeFileSync(
    join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    *) printf '%s\\n' "$1" >> "${argsLog}"; shift ;;
  esac
done
cp "${bodyFile}" "$output"
printf '%s' "${status}"
`,
  );
  chmodSync(join(bin, "curl"), 0o755);
  const result = spawnSync("bash", [script, stagingRef], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      SUPABASE_ACCESS_TOKEN: token,
    },
    encoding: "utf8",
  });
  const poolerPath = join(root, "supabase/.temp/pooler-url");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    pooler: readOptional(poolerPath),
    args: readFileSync(argsLog, "utf8"),
  };
}

describe("ensure-linked-session-pooler", () => {
  it("writes a password-less session URL from a session pooler entry", () => {
    const result = run(
      [
        {
          database_type: "PRIMARY",
          pool_mode: "session",
          db_host: "aws-1-eu-west-2.pooler.supabase.com",
          db_port: 5432,
          db_user: `postgres.${stagingRef}`,
          db_name: "postgres",
          connection_string: `postgresql://postgres.${stagingRef}:${plantedPassword}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
        },
      ],
      "200",
    );

    expect(result.status).toBe(0);
    expect(result.pooler).toBe(
      `postgresql://postgres.${stagingRef}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
    );
    expect(result.stdout).toContain("Pooler API status: 200");
    expect(result.stdout).toContain("host=aws-1-eu-west-2.pooler.supabase.com");
    expect(result.stdout).toContain("port=5432");
    expect(result.stdout).toContain("pool_mode=session");
    expect(result.stdout).toContain(`db_user=postgres.${stagingRef}`);
    expect(result.stdout).not.toContain(plantedPassword);
    expect(result.stderr).not.toContain(plantedPassword);
    expect(result.stdout).not.toContain(token);
    expect(result.stderr).not.toContain(token);
    expect(result.pooler).not.toContain("6543");
    expect(result.args).toContain("--max-redirs");
    expect(result.args).toContain(
      `https://api.supabase.com/v1/projects/${stagingRef}/config/database/pooler`,
    );
  });

  it("rewrites a transaction pooler entry onto session port 5432", () => {
    const result = run(
      [
        {
          database_type: "PRIMARY",
          pool_mode: "transaction",
          db_host: "aws-1-eu-west-2.pooler.supabase.com",
          db_port: 6543,
          db_user: `postgres.${stagingRef}`,
          db_name: "postgres",
        },
      ],
      "200",
    );

    expect(result.status).toBe(0);
    expect(result.pooler).toBe(
      `postgresql://postgres.${stagingRef}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
    );
    expect(result.stdout).toContain("API offered port 6543");
    expect(result.pooler).not.toContain("6543");
  });

  it("accepts a session entry whose database_type the CLI would skip", () => {
    const result = run(
      {
        pool_mode: "session",
        db_host: "aws-1-eu-west-2.pooler.supabase.com",
        db_port: "5432",
        db_user: `postgres.${stagingRef}`,
        db_name: "postgres",
        is_using_scram_auth: null,
        default_pool_size: "not-a-number",
      },
      "200",
    );

    expect(result.status).toBe(0);
    expect(result.pooler).toContain(":5432/postgres");
  });

  it("fails closed on 403 and does not invent a host", () => {
    const result = run({ message: "Forbidden" }, "403");

    expect(result.status).toBe(1);
    expect(result.pooler).toBeNull();
    expect(result.stderr).toContain("403");
    expect(result.stderr).toContain("database:read");
    expect(result.stdout).toContain("Pooler API status: 403");
    expect(result.stdout).not.toContain(token);
    expect(`${result.stdout}${result.stderr}`).not.toContain("aws-1-eu-west-2");
  });

  it("refuses a direct database host and a user for another project", () => {
    const direct = run(
      [
        {
          database_type: "PRIMARY",
          pool_mode: "session",
          db_host: `db.${stagingRef}.supabase.co`,
          db_port: 5432,
          db_user: `postgres.${stagingRef}`,
          db_name: "postgres",
        },
      ],
      "200",
    );
    expect(direct.status).toBe(1);
    expect(direct.pooler).toBeNull();

    const other = run(
      [
        {
          database_type: "PRIMARY",
          pool_mode: "session",
          db_host: "aws-1-eu-west-2.pooler.supabase.com",
          db_port: 5432,
          db_user: "postgres.nlzhllhkigmsvrzduefz",
          db_name: "postgres",
        },
      ],
      "200",
    );
    expect(other.status).toBe(1);
    expect(other.pooler).toBeNull();
  });

  it("keeps a pooler URL link already saved when the API fails", () => {
    const saved = "postgresql://postgres.btjnxvgkpdbfrrqxvkfj@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
    const result = run({ message: "unavailable" }, "500", { existingPooler: saved });

    expect(result.status).toBe(0);
    expect(result.pooler).toBe(saved);
    expect(result.stdout).toContain("aws-0-eu-west-1.pooler.supabase.com");
    expect(result.stdout).toContain("Pooler API status: 500");
  });

  it("does not call the API when the linked ref is not the requested ref", () => {
    const result = run([], "200", { linkedRef: "nlzhllhkigmsvrzduefz" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not");
    expect(result.args).toBe("");
    expect(result.pooler).toBeNull();
  });
});
