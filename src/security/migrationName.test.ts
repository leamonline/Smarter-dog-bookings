// The name a migration is recorded under is derived, never typed.
//
// WHY THIS EXISTS
//
// The two applied-migration checks match a committed file against prod's
// ledger by its 14-digit version OR the part of its filename after the
// timestamp. An MCP apply records its own version, so the name is the only
// thing that can match — and the MCP takes it as free text. #790 was applied
// with the whole filename as its name; the cron jobs were live, both checks
// said PENDING, and the daily audit would have alarmed until the ledger was
// corrected by hand.
//
// scripts/migration-name.mjs is the repository's one derivation. These tests
// pin it in three ways: the derivation itself; parity with the workflows'
// bash, extracted from the YAML and executed, so a change to either side
// fails here; and the guard in check-migrations.mjs that refuses two files
// sharing a name, because the checks would let one applied row vouch for both.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIGRATION_FILENAME_RE,
  MigrationNameError,
  deriveMigrationName,
  duplicateMigrationNames,
} from "../../scripts/migration-name.mjs";

const root = process.cwd();
const SCRIPT = join(root, "scripts", "migration-name.mjs");
const WORKFLOWS_DIR = join(root, ".github", "workflows");

// The case that caused this, verbatim.
const LATE_REMINDER = "20260906120000_late_reminder_pass.sql";

describe("deriveMigrationName", () => {
  it("derives the #790 name from its filename", () => {
    expect(deriveMigrationName(LATE_REMINDER)).toEqual({
      version: "20260906120000",
      name: "late_reminder_pass",
      base: "20260906120000_late_reminder_pass",
    });
  });

  it("ignores the directory part", () => {
    expect(
      deriveMigrationName(`supabase/migrations/${LATE_REMINDER}`).name,
    ).toBe("late_reminder_pass");
    expect(deriveMigrationName(`/abs/path/${LATE_REMINDER}`).name).toBe(
      "late_reminder_pass",
    );
  });

  it("keeps every underscore after the first", () => {
    // The bash rule is ${base#*_} — shortest prefix removed — so a name may
    // itself contain underscores, and all of them survive.
    expect(deriveMigrationName("20260101000000_a_b_c.sql").name).toBe("a_b_c");
  });

  it.each([
    ["late_reminder_pass.sql", "no timestamp"],
    ["2026090612000_late.sql", "13-digit timestamp"],
    ["20260906120000_Late.sql", "uppercase"],
    ["20260906120000_late-pass.sql", "hyphen"],
    ["20260906120000_late.sql.bak", "wrong extension"],
    ["20260906120000_late", "no extension"],
    ["20260906120000_.sql", "empty name"],
    ["20260906120000.sql", "no separator"],
    ["", "empty input"],
  ])("refuses %s (%s) rather than guessing", (input) => {
    expect(() => deriveMigrationName(input)).toThrow(MigrationNameError);
  });

  it("exposes the one filename pattern check-migrations.mjs also uses", () => {
    expect(MIGRATION_FILENAME_RE.test(LATE_REMINDER)).toBe(true);
    expect(MIGRATION_FILENAME_RE.test("notes.sql")).toBe(false);
  });
});

describe("parity with the workflows' bash rule", () => {
  // Extract the real `base=`, `ver=` and `name=` assignments from each
  // workflow and run them, so the derivation is held to the checks' own
  // text rather than to a retyped copy of it.
  const CASES = [
    LATE_REMINDER,
    `supabase/migrations/${LATE_REMINDER}`,
    "20260101000000_a_b_c.sql",
    "20260604120000_add_salon_config_settings.sql",
    "supabase/migrations/20260906100000_change_deadline_preview.sql",
  ];

  for (const workflow of [
    "check-migrations-applied.yml",
    "check-migrations-drift.yml",
  ]) {
    it(`agrees with ${workflow}`, () => {
      const source = readFileSync(join(WORKFLOWS_DIR, workflow), "utf8");
      const assignments = ["base=", "ver=", "name="].map((key) => {
        const match = source.match(new RegExp(`^\\s*(${key}[^\\n]*)$`, "m"));
        if (!match) throw new Error(`${workflow} no longer defines ${key}`);
        return match[1].replace(/\s+#.*$/, ""); // drop the trailing example comment
      });

      for (const file of CASES) {
        const script = [
          `f=${JSON.stringify(file)}`,
          ...assignments,
          `printf '%s\\n%s\\n%s' "$base" "$ver" "$name"`,
        ].join("; ");
        const bash = spawnSync("bash", ["-c", script], { encoding: "utf8" });
        expect(bash.status, bash.stderr).toBe(0);
        const [base, version, name] = bash.stdout.split("\n");
        expect(deriveMigrationName(file)).toEqual({ version, name, base });
      }
    });
  }
});

describe("duplicateMigrationNames", () => {
  it("reports files that share a name after the timestamp", () => {
    expect(
      duplicateMigrationNames([
        "20260101000000_fix.sql",
        "20260201000000_fix.sql",
        "20260301000000_other.sql",
      ]),
    ).toEqual([
      { name: "fix", files: ["20260101000000_fix.sql", "20260201000000_fix.sql"] },
    ]);
  });

  it("reports nothing when every name is unique", () => {
    expect(
      duplicateMigrationNames(["20260101000000_a.sql", "20260201000000_b.sql"]),
    ).toEqual([]);
  });

  it("skips malformed filenames rather than crashing", () => {
    // Those are check-migrations.mjs's own, louder, error.
    expect(duplicateMigrationNames(["notes.sql", "20260101000000_a.sql"])).toEqual([]);
  });
});

describe("check-migrations.mjs", () => {
  it("imports the shared pattern rather than redefining it", () => {
    const source = readFileSync(join(root, "scripts", "check-migrations.mjs"), "utf8");
    expect(source).toContain('from "./migration-name.mjs"');
    expect(source).not.toMatch(/const NAME_RE\s*=/);
    expect(source).toContain("duplicateMigrationNames(");
  });

  it("passes on the real migrations directory", () => {
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts", "check-migrations.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});

describe("the CLI", () => {
  function run(...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  }

  it("prints the name, one per line, ready to paste", () => {
    const result = run(
      `supabase/migrations/${LATE_REMINDER}`,
      "supabase/migrations/20260906100000_change_deadline_preview.sql",
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("late_reminder_pass\nchange_deadline_preview\n");
  });

  it("--json gives version, name and base", () => {
    const result = run("--json", LATE_REMINDER);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        path: LATE_REMINDER,
        version: "20260906120000",
        name: "late_reminder_pass",
        base: "20260906120000_late_reminder_pass",
      },
    ]);
  });

  it("exits 1 and names the offender on a malformed filename", () => {
    const result = run(LATE_REMINDER, "late_reminder_pass.sql");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("late_reminder_pass.sql: not a migration filename");
    // Nothing is printed for the good file either: a partial answer invites
    // pasting the wrong line.
    expect(result.stdout).toBe("");
  });

  it("exits 2 with usage when given nothing", () => {
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
