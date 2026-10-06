import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The manual production migration-apply workflow is the executable form of
// ADR 006's manual gate. It must be harder to reach than staging, not easier:
// dispatch-only, bound to the `production` environment, exact-ref
// confirmation before checkout, link-state assertion before every linked
// command, and the shared script's explicit production opt-in. The script
// itself must keep staging as its default and refuse production without
// both the opt-in and the repeated ref.

const root = process.cwd();
const workflow = readFileSync(
  join(root, ".github/workflows/production-apply-migrations.yml"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  join(root, ".github/workflows/staging-apply-migrations.yml"),
  "utf8",
);
const script = readFileSync(
  join(root, "scripts/apply-hosted-migrations.sh"),
  "utf8",
);
const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
const guardPath = join(root, ".claude/hooks/guard-supabase-apply-migration.sh");
const guard = readFileSync(guardPath, "utf8");

const productionRef = "nlzhllhkigmsvrzduefz";
const stagingRef = "btjnxvgkpdbfrrqxvkfj";
const targetAssertion =
  'test "$(cat supabase/.temp/project-ref)" = "$PRODUCTION_PROJECT_REF"';

function positionOf(needle: string): number {
  expect(workflow, `expected workflow to contain: ${needle}`).toContain(needle);
  return workflow.indexOf(needle);
}

describe("production apply-migrations workflow", () => {
  it("is manual-only, bound to the production environment and non-cancelling", () => {
    const triggerStart = positionOf("on:\n");
    const triggerEnd = positionOf("\npermissions:");
    const trigger = workflow.slice(triggerStart, triggerEnd);

    expect(trigger).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(trigger).toMatch(
      /^ {6}confirm_production_ref:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).toMatch(
      /^ {6}migrations:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).toMatch(
      /^ {6}reapply:\n(?: {8}.+\n)* {8}required: false\n(?: {8}.+\n)* {8}type: string$/m,
    );
    expect(trigger).not.toMatch(/^ {2}(?:push|pull_request|pull_request_target|schedule|repository_dispatch):/m);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toMatch(/write-all|contents: write|id-token: write/);
    expect(workflow).toMatch(
      /concurrency:\n {2}group: production-apply-migrations\n {2}cancel-in-progress: false/,
    );
    expect(workflow).toContain("    environment: production");
    expect(workflow).toContain("    timeout-minutes: 30");
  });

  it("confirms the exact production ref before checkout and never links staging", () => {
    expect(workflow).toContain(
      `      PRODUCTION_PROJECT_REF: ${productionRef}\n` +
        `      STAGING_PROJECT_REF: ${stagingRef}`,
    );

    const stepsStart = positionOf("    steps:\n");
    const guardStart = positionOf("      - name: Confirm exact production target");
    const checkoutStart = positionOf("        uses: actions/checkout@v7");

    expect(workflow.slice(stepsStart + "    steps:\n".length, guardStart)).toBe("");
    expect(guardStart).toBeLessThan(checkoutStart);
    expect(workflow).toContain(
      '          if [ "$CONFIRM_PRODUCTION_REF" != "$PRODUCTION_PROJECT_REF" ]; then',
    );
    expect(workflow).toContain(
      '          if [ "$STAGING_PROJECT_REF" = "$PRODUCTION_PROJECT_REF" ]; then',
    );
    expect(workflow).not.toContain('supabase link --project-ref "$STAGING_PROJECT_REF"');
    expect(workflow).not.toMatch(/supabase db push|supabase db dump|supabase db reset|migration repair/);
    // Inputs and context reach the shell only through env, never interpolated
    // into run: (a run script is the block of lines indented deeper than `run:`).
    const runScripts = Array.from(
      `${workflow}\nEND`.matchAll(/^ {8}run: \|\n((?:(?: {10}.*)?\n)+?)(?=^ {0,8}\S)/gm),
      (match) => match[1],
    );
    expect(runScripts.length).toBe(6);
    for (const body of runScripts) expect(body).not.toMatch(/\$\{\{/);
  });

  it("validates the names and shows the SQL before production is linked", () => {
    const preflight = positionOf("      - name: Validate the requested names and show the exact SQL");
    const link = positionOf('supabase link --project-ref "$PRODUCTION_PROJECT_REF"');
    expect(preflight).toBeLessThan(link);
    expect(workflow).toContain('^[0-9]{14}_[a-z0-9_]+\\.sql$');
    expect(workflow).toContain('if [ ! -f "supabase/migrations/$migration" ]; then');
    expect(workflow).toContain('cat "supabase/migrations/$migration"');
  });

  it("pins the requested actions and uses access-token-only authentication", () => {
    expect(workflow).toContain("uses: actions/checkout@v7");
    expect(workflow).toContain("uses: supabase/setup-cli@v3");
    expect(workflow).toContain("          version: 2.109.1");

    const secretNames = Array.from(
      workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*}}/g),
      (match) => match[1],
    );
    // Environment-only secret: GitHub auto-creates a referenced environment with
    // no protection rules, so the repository-level token must never be enough.
    expect([...new Set(secretNames)]).toEqual(["PRODUCTION_SUPABASE_ACCESS_TOKEN"]);
    expect(workflow).not.toMatch(/secrets\.SUPABASE_ACCESS_TOKEN\b/);
    const secretCheck = positionOf('          if [ -z "${PRODUCTION_SUPABASE_ACCESS_TOKEN:-}" ]; then');
    expect(secretCheck).toBeLessThan(positionOf("        uses: actions/checkout@v7"));
    expect(workflow).toContain("          PRODUCTION_SUPABASE_ACCESS_TOKEN: ${{ secrets.PRODUCTION_SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).not.toMatch(/SUPABASE_DB_PASSWORD|DATABASE_URL|SERVICE_ROLE|--password\b/i);
    expect(workflow).not.toMatch(
      /supabase functions deploy|vercel (?:deploy|--prod)|npm run seed|supabase (?:db )?seed\b/i,
    );
    // Never echo a secret's value (a message naming the secret is fine).
    expect(workflow).not.toMatch(/set -x|echo [^\n]*\$\{?[A-Z_]*(?:TOKEN|PGPASSWORD)/);
  });

  it("asserts the production link before every linked command and hands off with the opt-in", () => {
    const link = positionOf('supabase link --project-ref "$PRODUCTION_PROJECT_REF"');
    const before = positionOf(`${targetAssertion}\n          supabase migration list --linked`);
    const apply = positionOf(
      `${targetAssertion}\n          # Word-splitting the input is intentional; the script validates each name.\n` +
        `          # shellcheck disable=SC2086\n` +
        `          scripts/apply-hosted-migrations.sh "$PRODUCTION_PROJECT_REF" $MIGRATIONS 2>&1 | tee apply.log`,
    );
    expect(link).toBeLessThan(before);
    expect(before).toBeLessThan(apply);

    // Every `--linked` command is immediately preceded by the assertion.
    const linkedCommands = workflow.match(/^.*--linked\b.*$/gm) ?? [];
    expect(linkedCommands.length).toBe(2);
    const lines = workflow.split("\n");
    for (const command of linkedCommands) {
      const index = lines.indexOf(command);
      expect(lines[index - 1].trim()).toBe(targetAssertion);
    }

    expect(workflow).toContain("          HOSTED_MIGRATION_TARGET: production");
    expect(workflow).toContain("          CONFIRM_PRODUCTION_REF: ${{ inputs.confirm_production_ref }}");
    expect(workflow).toContain("          MIGRATIONS: ${{ inputs.migrations }}");
    expect(workflow).toContain("          REAPPLY_MIGRATIONS: ${{ inputs.reapply }}");
  });

  it("records who, what and the verified ref, and summarises every step's outcome", () => {
    expect(workflow).toContain("          ACTOR: ${{ github.actor }}");
    expect(workflow).toContain("          TRIGGERING_ACTOR: ${{ github.triggering_actor }}");
    expect(workflow).toContain('echo "| Migrations requested | \\`$MIGRATIONS\\` |"');
    expect(workflow).toContain(
      'echo "| Linked project ref verified | \\`$(cat supabase/.temp/project-ref)\\` |" >> "$GITHUB_STEP_SUMMARY"',
    );
    expect(workflow).toContain("      - name: Summarise the outcome\n        if: ${{ always() }}");
    for (const outcome of ["PREFLIGHT_OUTCOME", "LINK_OUTCOME", "APPLY_OUTCOME", "AFTER_OUTCOME"]) {
      expect(workflow).toContain(outcome);
    }
    expect(workflow).toContain("grep -E '^(file|apply|reapply|skip|done|recorded|MISSING|MISMATCH) ' apply.log");
  });

  it("keeps the staging workflow unable to reach production through the shared script", () => {
    expect(stagingWorkflow).not.toMatch(/HOSTED_MIGRATION_TARGET|CONFIRM_PRODUCTION_REF/);
    expect(stagingWorkflow).toContain('scripts/apply-hosted-migrations.sh "$STAGING_PROJECT_REF" $MIGRATIONS');
  });

  it("makes the script default to staging and demand both opt-in and confirmation for production", () => {
    expect(script).toContain(`STAGING_PROJECT_REF="${stagingRef}"`);
    expect(script).toContain(`PRODUCTION_PROJECT_REF="${productionRef}"`);
    expect(script).toContain('TARGET="${HOSTED_MIGRATION_TARGET:-staging}"');
    expect(script).toMatch(/^ {2}staging\)\n {4}EXPECTED_PROJECT_REF="\$STAGING_PROJECT_REF"/m);
    expect(script).toMatch(
      /^ {2}production\)\n {4}EXPECTED_PROJECT_REF="\$PRODUCTION_PROJECT_REF"\n {4}if \[ "\$\{CONFIRM_PRODUCTION_REF:-}" != "\$PRODUCTION_PROJECT_REF" \]; then\n(?: {6}.+\n)* {6}exit 1/m,
    );
    expect(script).toMatch(/^ {2}\*\)\n(?: {4}.+\n)* {4}exit 1/m);
    expect(script).toContain('test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"');
    expect(script).toContain('if [ "$TARGET_PROJECT_REF" != "$EXPECTED_PROJECT_REF" ]; then');
    expect(script).toContain(
      'test "$(cat supabase/.temp/project-ref)" = "$TARGET_PROJECT_REF"\nsupabase db dump --linked --schema public --dry-run',
    );

    // Target resolution happens before any file is read or any hosted command runs.
    const resolution = script.indexOf('case "$TARGET" in');
    const validation = script.indexOf('test -f "supabase/migrations/$migration"');
    const dump = script.indexOf("supabase db dump --linked");
    expect(resolution).toBeGreaterThan(-1);
    expect(resolution).toBeLessThan(validation);
    expect(validation).toBeLessThan(dump);
  });

  it("makes the script show before-state, identify each file, and verify the ledger afterwards", () => {
    const listing =
      "--command \"set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;\"";
    expect(script.split(listing).length - 1).toBe(2);
    expect(script).toContain('echo "Ledger rows before this run ($TARGET $TARGET_PROJECT_REF):"');
    expect(script).toContain('echo "Ledger rows after this run:"');
    expect(script).toMatch(/echo "file {3}\$migration sha256=\$\(sha256sum/);
    expect(script).toContain('echo "done   $migration"');
    expect(script).toContain(
      "\"select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where name = :'name';\" |",
    );
    expect(script).toContain('echo "MISSING $migration: no ledger row is named \'$name\'" >&2');
    expect(script).toContain('test "$missing" = 0');

    // A recorded name is skipped only when the stored SQL equals the committed
    // file; otherwise the run stops. A re-apply refreshes the stored SQL in the
    // same transaction, and the final verification compares content too.
    expect(script).toContain("select coalesce(array_to_string(statements, E'\\\\n'), '') from supabase_migrations.schema_migrations where name = :'name' order by version desc limit 1;");
    expect(script).toContain('    if [ "$(stored_sql "$name")" = "$(cat "$file")" ]; then');
    expect(script).toMatch(/echo "MISMATCH \$migration: name already in the \$TARGET ledger but its stored SQL differs from the committed file\." >&2\n(?:.*\n)? {4}exit 1/);
    expect(script).toContain(`echo "update supabase_migrations.schema_migrations set statements = array[:'body'] where name = :'name';"`);
    expect(script.indexOf("update supabase_migrations.schema_migrations set statements")).toBeLessThan(
      script.indexOf("insert into supabase_migrations.schema_migrations (version, name, statements)"),
    );
    expect(script).toContain('  elif [ "$(stored_sql "$name")" != "$(cat "supabase/migrations/$migration")" ]; then');

    const apply = script.indexOf('echo "commit;"');
    const verify = script.indexOf("Verifying the requested migrations are recorded");
    const after = script.indexOf('echo "Ledger rows after this run:"');
    expect(apply).toBeLessThan(verify);
    expect(verify).toBeLessThan(after);
  });
});

describe("the Claude permission for apply_migration is guarded", () => {
  it("allows exactly that one Supabase MCP tool", () => {
    expect(settings.permissions.allow).toEqual(["mcp__Supabase__apply_migration"]);
    const broad = (settings.permissions.allow as string[]).filter(
      (rule) => rule !== "mcp__Supabase__apply_migration" && /supabase/i.test(rule),
    );
    expect(broad).toEqual([]);
    expect(settings.permissions.deny ?? []).toEqual([]);
  });

  it("sends every non-staging project ref back to the permission prompt", () => {
    const matcher = settings.hooks.PreToolUse.find(
      (entry: { matcher?: string }) => entry.matcher === "mcp__Supabase__apply_migration",
    );
    expect(matcher).toBeDefined();
    expect(matcher.hooks.map((h: { command: string }) => h.command)).toEqual([
      "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-supabase-apply-migration.sh",
    ]);
    expect(statSync(guardPath).mode & 0o111).not.toBe(0);
    expect(guard).toContain(`STAGING_PROJECT_REF="${stagingRef}"`);
    expect(guard).toContain(`PRODUCTION_PROJECT_REF="${productionRef}"`);
    expect(guard).toMatch(/^ {2}"\$STAGING_PROJECT_REF"\)\n {4}decide allow /m);
    expect(guard).toMatch(/^ {2}"\$PRODUCTION_PROJECT_REF"\)\n {4}decide ask /m);
    expect(guard).toMatch(/^ {2}\*\)\n {4}decide ask /m);
    // "allow" appears for staging only.
    expect(guard.match(/decide allow /g)?.length).toBe(1);
    expect(guard).not.toMatch(/permissionDecision":"deny/);
  });
});
