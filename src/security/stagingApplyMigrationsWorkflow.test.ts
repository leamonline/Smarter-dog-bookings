import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The manual staging migration-apply workflow exists because the MCP
// migration tool refuses any SQL text containing a destructive keyword, even
// inside a function body. It must stay as narrowly scoped as the Tranche 1
// workflow it is modelled on: manual-only, staging-only, access-token-only,
// with the exact-ref confirmation as the first step and every linked command
// immediately preceded by the link-state assertion.

const root = process.cwd();
const workflow = readFileSync(
  join(root, ".github/workflows/staging-apply-migrations.yml"),
  "utf8",
);
const script = readFileSync(
  join(root, "scripts/apply-hosted-migrations.sh"),
  "utf8",
);

const productionRef = "nlzhllhkigmsvrzduefz";
const stagingRef = "btjnxvgkpdbfrrqxvkfj";
const targetAssertion =
  'test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"';
const scriptTargetAssertion =
  'test "$(cat supabase/.temp/project-ref)" = "$TARGET_PROJECT_REF"';

function positionOf(needle: string): number {
  expect(workflow, `expected workflow to contain: ${needle}`).toContain(needle);
  return workflow.indexOf(needle);
}

describe("staging apply-migrations workflow", () => {
  it("is manual-only, approval-bound and non-cancelling", () => {
    const triggerStart = positionOf("on:\n");
    const triggerEnd = positionOf("\npermissions:");
    const trigger = workflow.slice(triggerStart, triggerEnd);

    expect(trigger).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(trigger).toMatch(
      /^ {6}confirm_staging_ref:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).toMatch(
      /^ {6}migrations:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).not.toMatch(/^ {2}(?:push|pull_request|schedule):/m);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(
      /concurrency:\n {2}group: staging-apply-migrations\n {2}cancel-in-progress: false/,
    );
    expect(workflow).toContain("    environment: staging");
  });

  it("makes exact target confirmation the first step and never links production", () => {
    expect(workflow).toContain(
      `      PRODUCTION_PROJECT_REF: ${productionRef}\n` +
        `      STAGING_PROJECT_REF: ${stagingRef}`,
    );

    const stepsStart = positionOf("    steps:\n");
    const guardStart = positionOf("      - name: Confirm exact staging target");
    const checkoutStart = positionOf("        uses: actions/checkout@v7");

    expect(workflow.slice(stepsStart + "    steps:\n".length, guardStart)).toBe(
      "",
    );
    expect(guardStart).toBeLessThan(checkoutStart);
    expect(workflow).toContain(
      '          if [ "$CONFIRM_STAGING_REF" != "$STAGING_PROJECT_REF" ]; then',
    );
    expect(workflow).toContain(
      '          if [ "$STAGING_PROJECT_REF" = "$PRODUCTION_PROJECT_REF" ]; then',
    );
    expect(workflow).not.toContain(
      'supabase link --project-ref "$PRODUCTION_PROJECT_REF"',
    );
    expect(workflow).not.toMatch(/supabase db push|supabase db dump/);
  });

  it("pins the requested actions and uses access-token-only authentication", () => {
    expect(workflow).toContain("uses: actions/checkout@v7");
    expect(workflow).toContain("uses: supabase/setup-cli@v3");
    expect(workflow).toContain("          version: 2.109.1");

    const secretNames = Array.from(
      workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*}}/g),
      (match) => match[1],
    );
    expect([...new Set(secretNames)]).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(workflow).not.toMatch(
      /SUPABASE_DB_PASSWORD|DATABASE_URL|SERVICE_ROLE|--password\b/i,
    );
    expect(workflow).not.toMatch(
      /supabase functions deploy|vercel (?:deploy|--prod)|npm run seed|supabase (?:db )?seed\b/i,
    );
  });

  it("proves the staging link before every linked command and hands off to the script", () => {
    const stagingLink = positionOf(
      'supabase link --project-ref "$STAGING_PROJECT_REF"',
    );
    const migrationList = positionOf("supabase migration list --linked");
    const apply = positionOf(
      'scripts/apply-hosted-migrations.sh "$STAGING_PROJECT_REF" $MIGRATIONS',
    );

    expect(stagingLink).toBeLessThan(migrationList);
    expect(migrationList).toBeLessThan(apply);
    expect(workflow).toContain(
      `${targetAssertion}\n          supabase migration list --linked`,
    );
    expect(workflow).toContain("          MIGRATIONS: ${{ inputs.migrations }}");
    expect(workflow).toContain(
      "          REAPPLY_MIGRATIONS: ${{ inputs.reapply }}",
    );
    expect(workflow).toMatch(
      /^ {6}reapply:\n(?: {8}.+\n)* {8}required: false\n(?: {8}.+\n)* {8}type: string$/m,
    );
    // The script's production opt-in is never set here, so this workflow can only ever reach staging.
    expect(workflow).not.toMatch(/HOSTED_MIGRATION_TARGET|CONFIRM_PRODUCTION_REF/);
  });

  it("keeps the script staging by default, production only by explicit opt-in, and transactional with its ledger row", () => {
    expect(script).toContain(`STAGING_PROJECT_REF="${stagingRef}"`);
    expect(script).toContain(`PRODUCTION_PROJECT_REF="${productionRef}"`);
    expect(script).toContain('TARGET="${HOSTED_MIGRATION_TARGET:-staging}"');
    expect(script).toContain('if [ "$TARGET_PROJECT_REF" != "$EXPECTED_PROJECT_REF" ]; then');
    expect(script).toContain(
      'if [ "${CONFIRM_PRODUCTION_REF:-}" != "$PRODUCTION_PROJECT_REF" ]; then',
    );
    expect(script).toContain(
      'test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"',
    );
    expect(script).toContain(
      `${scriptTargetAssertion}\nsupabase db dump --linked --schema public --dry-run`,
    );
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain(
      "sed -En '/^export PG(HOST|PORT|USER|PASSWORD|DATABASE)=/p'",
    );
    expect(script).toContain('source "$credential_exports"');
    expect(script).not.toContain("source <(");
    expect(script).not.toMatch(/set -x|echo .*PGPASSWORD/i);

    // Only committed migration basenames are accepted, never arbitrary paths or SQL.
    expect(script).toContain('^[0-9]{14}_[a-z0-9_]+\\.sql$');
    expect(script).toContain('test -f "supabase/migrations/$migration"');

    // Ledger identity is the NAME (what CI's migrations-applied check reads):
    // a present name is skipped unless explicitly re-applied, and even a
    // re-apply never adds a second ledger row for that name.
    expect(script).toContain(
      "select count(*) from supabase_migrations.schema_migrations where name = :'name';",
    );
    // The CLI's temporary login is not postgres: every psql session must adopt
    // the role before touching supabase_migrations (run #3 failed on exactly this).
    expect(script).toContain(
      `      "set role postgres;" \\\n      "select count(*) from supabase_migrations.schema_migrations where name = :'name';" |`,
    );
    expect(script).toContain('echo "set role postgres;"');
    expect(script).toContain(
      "--command \"set role postgres; select version || '  ' || name from supabase_migrations.schema_migrations order by version;\"",
    );
    expect(script).toContain('if [ "$already" != "0" ] && ! may_reapply "$migration"; then');
    expect(script).toContain('for candidate in ${REAPPLY_MIGRATIONS:-}; do');
    expect(script).toContain(
      "where not exists (select 1 from supabase_migrations.schema_migrations where name = :'name');",
    );

    // Schema change and ledger row commit together.
    const begin = script.indexOf('echo "begin;"');
    const body = script.indexOf('cat "$file"');
    const ledger = script.indexOf(
      "insert into supabase_migrations.schema_migrations (version, name, statements)",
    );
    const commit = script.indexOf('echo "commit;"');
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(body);
    expect(body).toBeLessThan(ledger);
    expect(ledger).toBeLessThan(commit);
    expect(script).toContain("--set ON_ERROR_STOP=1");
  });
});
