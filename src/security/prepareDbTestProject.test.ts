import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = join(
  process.cwd(),
  "scripts/prepare-db-test-project.mjs",
);
const temporaryRoots: string[] = [];

function makeSourceProject(): string {
  const root = mkdtempSync(join(tmpdir(), "smarter-dog-db-test-source-"));
  temporaryRoots.push(root);

  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "supabase", "tests", "fixtures"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "supabase", "config.toml"),
    'project_id = "fixture"\n',
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20260507132400_before.sql"),
    "select 'before';\n",
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20260510235900_after.sql"),
    "select 'after';\n",
  );
  writeFileSync(
    join(root, "supabase", "tests", "000_smoke.test.sql"),
    "select 1;\n",
  );

  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("prepare-db-test-project", () => {
  it("copies the project and inserts its CI-only privilege boundaries in migration order", () => {
    const sourceRoot = makeSourceProject();
    const outputRoot = join(
      mkdtempSync(join(tmpdir(), "smarter-dog-db-test-output-parent-")),
      "project",
    );
    temporaryRoots.push(outputRoot.replace(/\/project$/, ""));

    const result = spawnSync(process.execPath, [script, outputRoot], {
      cwd: sourceRoot,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(
      readdirSync(join(outputRoot, "supabase", "migrations")).sort(),
    ).toEqual([
      "20260330000000_ci_legacy_api_default_privileges.sql",
      "20260507132400_before.sql",
      "20260510235859_ci_local_vault_prerequisite.sql",
      "20260510235900_after.sql",
      "20260729000000_ci_require_explicit_api_privileges.sql",
    ]);
    expect(
      readFileSync(join(outputRoot, "supabase", "config.toml"), "utf8"),
    ).toBe('project_id = "fixture"\n');
    expect(
      readFileSync(
        join(
          outputRoot,
          "supabase",
          "migrations",
          "20260510235859_ci_local_vault_prerequisite.sql",
        ),
        "utf8",
      ),
    ).toMatch(
      /vault\.create_secret\(\s*'http:\/\/localhost:54321',\s*'supabase_url'/,
    );
    const legacyPrivileges = readFileSync(
      join(
        outputRoot,
        "supabase",
        "migrations",
        "20260330000000_ci_legacy_api_default_privileges.sql",
      ),
      "utf8",
    );
    expect(legacyPrivileges).toMatch(
      /alter default privileges for role postgres in schema public\s+grant select, insert, update, delete on tables\s+to anon, authenticated, service_role/i,
    );
    expect(legacyPrivileges).toMatch(
      /alter default privileges for role postgres in schema public\s+grant usage, select on sequences\s+to anon, authenticated, service_role/i,
    );
    const explicitPrivileges = readFileSync(
      join(
        outputRoot,
        "supabase",
        "migrations",
        "20260729000000_ci_require_explicit_api_privileges.sql",
      ),
      "utf8",
    );
    expect(explicitPrivileges).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke select, insert, update, delete on tables\s+from anon, authenticated, service_role/i,
    );
    expect(explicitPrivileges).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke usage, select on sequences\s+from anon, authenticated, service_role/i,
    );
    expect(
      existsSync(
        join(
          sourceRoot,
          "supabase",
          "migrations",
          "20260510235859_ci_local_vault_prerequisite.sql",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(
          sourceRoot,
          "supabase",
          "migrations",
          "20260330000000_ci_legacy_api_default_privileges.sql",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(
          sourceRoot,
          "supabase",
          "migrations",
          "20260729000000_ci_require_explicit_api_privileges.sql",
        ),
      ),
    ).toBe(false);
  });

  it("refuses to overwrite the source project", () => {
    const sourceRoot = makeSourceProject();

    const result = spawnSync(process.execPath, [script, sourceRoot], {
      cwd: sourceRoot,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Output must be outside the source project",
    );
    expect(
      readFileSync(
        join(
          sourceRoot,
          "supabase",
          "migrations",
          "20260507132400_before.sql",
        ),
        "utf8",
      ),
    ).toBe("select 'before';\n");
  });

  it("refuses a new output directory nested inside the source project", () => {
    const sourceRoot = makeSourceProject();
    const nestedOutput = join(sourceRoot, "generated", "project");

    const result = spawnSync(process.execPath, [script, nestedOutput], {
      cwd: sourceRoot,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Output must be outside the source project",
    );
    expect(existsSync(nestedOutput)).toBe(false);
  });
});
