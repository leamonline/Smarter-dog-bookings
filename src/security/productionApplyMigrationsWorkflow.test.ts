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
const gate = readFileSync(join(root, ".github/workflows/check-migrations-applied.yml"), "utf8");
const provenance = readFileSync(join(root, "scripts/production-ref-provenance.sh"), "utf8");
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
    expect(trigger).toMatch(/^ {6}ref:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m);
    expect(trigger).toMatch(
      /^ {6}postcondition:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).not.toMatch(/^ {2}(?:push|pull_request|pull_request_target|schedule|repository_dispatch):/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n {2}pull-requests: read(?: #.*)?\n {2}actions: read(?: #.*)?\n\n/m);
    expect(workflow).not.toMatch(/write-all|: write\b|id-token/);
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
    expect(runScripts.length).toBe(7);
    for (const body of runScripts) expect(body).not.toMatch(/\$\{\{/);
  });

  it("takes only supabase/migrations from the named commit, after checking out main", () => {
    const checkout = positionOf("        uses: actions/checkout@v7");
    const overlay = positionOf("      - name: Take supabase/migrations from the reviewed commit");
    const preflight = positionOf("      - name: Validate the requested names and show the exact SQL");
    expect(checkout).toBeLessThan(overlay);
    expect(overlay).toBeLessThan(preflight);
    // The commit must be current: on main, or the present head of an open pull request into main.
    expect(workflow).toContain('          GH_TOKEN: ${{ github.token }}');
    // One current main, resolved after the approval wait, serves both the
    // provenance check and the append-only check; the dispatch-time checkout
    // (HEAD) is never the reference, and the apply code must match current main.
    expect(workflow).toContain("          git fetch --no-tags --depth=1 origin main\n          main_sha=\"$(git rev-parse FETCH_HEAD)\"\n          echo \"main_sha=$main_sha\" >> \"$GITHUB_OUTPUT\"");
    expect(workflow).toContain('            if ! git diff --quiet "$GITHUB_SHA" "$main_sha" -- .github/workflows/production-apply-migrations.yml scripts/apply-hosted-migrations.sh scripts/lex-migration-sql.pl scripts/production-ref-provenance.sh; then');
    // Provenance (on main, or the current head of an open, non-draft pull
    // request with no outstanding changes request) is decided by one script,
    // run against the fetched main SHA, and run again before the write.
    expect(workflow).toContain('          scripts/production-ref-provenance.sh "$main_sha" "$MIGRATION_REF" | tee provenance.out');
    expect(workflow).toContain('          scripts/production-ref-provenance.sh "$MAIN_SHA" "$MIGRATION_REF" | tee provenance-now.out');
    expect(workflow).not.toContain("compare/main...");
    expect(workflow).not.toContain('compare="$(gh api');
    expect(workflow.indexOf("git fetch --no-tags --depth=1 origin main")).toBeLessThan(workflow.indexOf('scripts/production-ref-provenance.sh "$main_sha"'));
    expect(statSync(join(root, "scripts/production-ref-provenance.sh")).mode & 0o111).not.toBe(0);
    expect(provenance).toContain('compare="$(gh api "repos/$GITHUB_REPOSITORY/compare/$main_sha...$ref" --jq \'.status\')"');
    expect(provenance).toContain('if [ "$compare" = "identical" ] || [ "$compare" = "behind" ]; then');
    expect(provenance).toContain('pr_number="$(gh api "repos/$GITHUB_REPOSITORY/commits/$ref/pulls" |');
    expect(provenance).toContain('select(.state == "open" and .base.ref == "main" and .head.sha == $sha and .draft == false)');
    expect(provenance).toContain('reviews_json="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$pr_number/reviews?per_page=100")"');
    expect(provenance).toContain("if [ \"$(printf '%s' \"$reviews_json\" | jq 'length')\" -ge 100 ]; then");
    expect(provenance).toContain(
      "jq -r '[.[] | select(.state == \"APPROVED\" or .state == \"CHANGES_REQUESTED\" or .state == \"DISMISSED\")] | group_by(.user.login) | map(max_by(.submitted_at)) | map(select(.state != \"DISMISSED\")) | map(\"\\(.user.login)=\\(.state)@\\(.commit_id[0:7])\") | join(\" \")'",
    );
    expect(provenance).not.toContain("select(.commit_id == $sha");
    expect(provenance).toContain("if printf '%s' \"$reviews\" | grep -q '=CHANGES_REQUESTED'; then");
    expect(provenance).toContain('echo "provenance=current head of open pull request #$pr_number; latest review per reviewer: ${reviews:-none}"');
    expect(provenance).toContain('echo "pr_number=$pr_number"');
    expect(workflow).toContain("          MAIN_SHA: ${{ steps.overlay.outputs.main_sha }}");
    expect(workflow).toContain('          if [[ ! "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]]; then');
    expect(workflow).not.toMatch(/HEAD:supabase/);
    // The pull request number confirmed in the overlay step is carried to the
    // write boundary, where the same script runs again against the same main
    // SHA and must reach the same verdict (same pull request, still its head,
    // still no outstanding changes request), or nothing is applied. The run
    // then records a provenance line in each ledger row for the merge gate.
    expect(workflow).toContain('          echo "pr_number=$pr_number" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("          PR_NUMBER: ${{ steps.overlay.outputs.pr_number }}");
    expect(workflow).toMatch(/if \[ "\$\(sed -n 's\/\^pr_number=\/\/p' provenance-now\.out\)" != "\$PR_NUMBER" \]; then\n {12}echo "::error::The commit's provenance changed since the overlay step[^\n]*\n {12}exit 1/);
    expect(workflow.indexOf('scripts/production-ref-provenance.sh "$MAIN_SHA"')).toBeLessThan(workflow.indexOf('scripts/apply-hosted-migrations.sh "$PRODUCTION_PROJECT_REF" $MIGRATIONS'));
    expect(workflow).toContain('            LEDGER_PROVENANCE="-- applied to production from pull request #$PR_NUMBER head $MIGRATION_REF by $GITHUB_ACTOR, run $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"');
    expect(workflow).toContain('            LEDGER_PROVENANCE="-- applied to production from main $MIGRATION_REF by $GITHUB_ACTOR, run $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"');
    expect(workflow).toContain("          export LEDGER_PROVENANCE");
    expect(workflow).not.toContain("head_now=");
    expect(workflow.indexOf('scripts/production-ref-provenance.sh "$main_sha"')).toBeLessThan(workflow.indexOf('git fetch --no-tags --depth=1 origin "$MIGRATION_REF"'));
    expect(workflow).toContain('          git fetch --no-tags --depth=1 origin "$MIGRATION_REF"');
    // The directory is emptied first, so a main-only file cannot survive a wrong SHA.
    expect(workflow).toContain(
      '          rm -rf supabase/migrations\n          git checkout "$MIGRATION_REF" -- supabase/migrations/',
    );
    // Every requested file must be a regular blob in that commit (never a symlink)
    // and byte-identical to it after the overlay.
    expect(workflow).toContain('mode="$(git ls-tree "$MIGRATION_REF" -- "supabase/migrations/$migration" | awk \'{print $1}\')"');
    expect(workflow).toContain('            if [ "$mode" != "100644" ] && [ "$mode" != "100755" ]; then');
    expect(workflow).toContain('            if [ -L "supabase/migrations/$migration" ] || [ ! -f "supabase/migrations/$migration" ]; then');
    expect(workflow).toContain('            if ! git show "$MIGRATION_REF:supabase/migrations/$migration" | cmp -s - "supabase/migrations/$migration"; then');
    // Applied history is append-only: a file already on main must be identical to main's.
    expect(workflow).toContain('            if git cat-file -e "$MAIN_SHA:supabase/migrations/$migration" 2>/dev/null &&');
    expect(workflow).toContain('               ! git show "$MAIN_SHA:supabase/migrations/$migration" | cmp -s - "supabase/migrations/$migration"; then');
    // A commit already on main may only apply files current main still
    // carries; only a current pull request head may introduce a new path.
    expect(workflow).toContain('            if [ -z "$PR_NUMBER" ] && ! git cat-file -e "$MAIN_SHA:supabase/migrations/$migration" 2>/dev/null; then');
    expect(workflow).toMatch(/echo "::error::supabase\/migrations\/\$migration is not on current main \(\$MAIN_SHA\)[^\n]*\n {14}exit 1/);
    // The overlaid tree passes the repository's own structural validation
    // (unique timestamps and names, no empty file) before production is linked.
    expect(workflow).toContain("          node scripts/check-migrations.mjs");
    expect(workflow).toContain("      - name: Set up Node for the migration validator\n        uses: actions/setup-node@v7\n        with:\n          node-version: 24");
    expect(positionOf("          node scripts/check-migrations.mjs")).toBeLessThan(positionOf("      - name: Link production and record its migration state before applying"));
    expect(workflow).toContain("            echo \"::error::reapply entry '$candidate' is not in migrations, so it would never run.\"");
    expect(workflow).toContain('          if [ "$(printf \'%s\\n\' $MIGRATIONS | sort | uniq -d | wc -l | tr -d \' \')" != "0" ]; then');
    // Never the whole tree from the ref: the workflow and script stay as on main.
    expect(workflow).not.toMatch(/git checkout "\$MIGRATION_REF"(?! -- supabase\/migrations\/)/);
    expect(workflow).not.toMatch(/^\s+ref: \$\{\{ inputs\.ref }}/m);
    expect(workflow).toContain("          MIGRATION_REF: ${{ inputs.ref }}");
  });

  it("validates the names and shows the SQL before production is linked", () => {
    const preflight = positionOf("      - name: Validate the requested names and show the exact SQL");
    const link = positionOf('supabase link --project-ref "$PRODUCTION_PROJECT_REF"');
    expect(preflight).toBeLessThan(link);
    expect(workflow).toContain('^[0-9]{14}_[a-z0-9_]+\\.sql$');
    expect(workflow).toContain('if [ -L "supabase/migrations/$migration" ] || [ ! -f "supabase/migrations/$migration" ]; then');
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
    // A same-named secret at repository level must never stand in for the
    // environment's approval: the job reads the environment itself and refuses
    // without a required-reviewers rule and a deployment branch policy, and it
    // only runs when dispatched from main. All before checkout.
    expect(workflow).toContain('          if [ "$GITHUB_REF" != "refs/heads/main" ]; then');
    expect(workflow).toContain('          if ! environment="$(gh api "repos/$GITHUB_REPOSITORY/environments/production")"; then');
    expect(workflow).toContain("          reviewers=\"$(printf '%s' \"$environment\" | jq '[.protection_rules[]? | select(.type == \"required_reviewers\") | .reviewers | length] | add // 0')\"");
    expect(workflow).toMatch(/if \[ "\$reviewers" -lt 1 \]; then\n {12}echo "::error::The production environment has no required reviewers[^\n]*\n {12}exit 1/);
    expect(workflow).toMatch(/if \[ "\$\(printf '%s' "\$environment" \| jq '\.deployment_branch_policy == null'\)" = "true" \]; then\n {12}echo "::error::The production environment has no deployment branch policy[^\n]*\n {12}exit 1/);
    expect(positionOf('          if ! environment="$(gh api')).toBeLessThan(positionOf("        uses: actions/checkout@v7"));
    expect(positionOf('          if [ "$GITHUB_REF" != "refs/heads/main" ]; then')).toBeLessThan(positionOf("        uses: actions/checkout@v7"));
    // The ref and the postcondition are validated before checkout too.
    expect(positionOf('          if [[ ! "$MIGRATION_REF" =~ ^[0-9a-f]{40}$ ]]; then')).toBeLessThan(
      positionOf("        uses: actions/checkout@v7"),
    );
    expect(positionOf('          if [ -z "${POSTCONDITION_SQL// /}" ]; then')).toBeLessThan(
      positionOf("        uses: actions/checkout@v7"),
    );
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
    expect(workflow).toContain("          POSTCONDITION_SQL: ${{ inputs.postcondition }}");
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
    expect(workflow).toContain("grep -E '^(file|strip|apply|reapply|skip|done|recorded|MISSING|MISMATCH|CONFLICT|REFUSED|postcondition|POSTCONDITION) ' apply.log");
    expect(workflow).toContain('echo "| Migration files from commit | \\`$MIGRATION_REF\\` |"');
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
    expect(script).toContain('if [ "$TARGET" = "production" ] && [ -z "${POSTCONDITION_SQL:-}" ]; then');
    expect(script).toContain(
      'test "$(cat supabase/.temp/project-ref)" = "$TARGET_PROJECT_REF"\nsupabase db dump --linked --schema public --dry-run',
    );

    // Target resolution happens before any file is read or any hosted command runs.
    const resolution = script.indexOf('case "$TARGET" in');
    const postconditionGate = script.indexOf('[ -z "${POSTCONDITION_SQL:-}" ]');
    const validation = script.indexOf('test -f "supabase/migrations/$migration"');
    const dump = script.indexOf("supabase db dump --linked");
    expect(resolution).toBeGreaterThan(-1);
    expect(resolution).toBeLessThan(postconditionGate);
    expect(postconditionGate).toBeLessThan(validation);
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
      "\"select string_agg(version || ' ' || name, ', ' order by version) from supabase_migrations.schema_migrations where $LEDGER_MATCH;\" |",
    );
    expect(script).toContain('echo "MISSING $migration: no ledger row is named after it (name or basename)" >&2');
    // A file's own top-level begin;/commit; lines are removed so the apply's
    // transaction (with the ledger row) is the only one, and anything else
    // psql or PostgreSQL would still act on (other transaction control, psql
    // meta-commands, variable interpolation, unreadable quoting) is refused.
    // Both come from one quoting-aware scan, scripts/lex-migration-sql.pl
    // (behaviour pinned in lexMigrationSql.test.ts), never from a line-wise
    // grep or a comment strip over the raw file, which quoted text can fool.
    expect(script).toContain('lexer="$(cd "$(dirname "$0")" && pwd)/lex-migration-sql.pl"');
    expect(script).toContain('test -f "$lexer"');
    expect(script).toContain("command -v perl >/dev/null");
    expect(script).toMatch(/if ! executed="\$\(perl "\$lexer" executed < "\$file" 2>\/dev\/null\)"; then\n {4}echo "REFUSED \$migration: \$\(perl "\$lexer" executed < "\$file" 2>&1 >\/dev\/null\)" >&2\n {4}exit 1/);
    expect(script).toMatch(/if ! findings="\$\(perl "\$lexer" check < "\$file"\)"; then\n {4}echo "REFUSED \$migration: .*" >&2\n {4}exit 1/);
    expect(script).not.toMatch(/grep -viE '\^\[\[:space:]]\*\(begin\|commit\)/);
    expect(script).not.toMatch(/sed -E 's\/--\.\*\$\/\/'/);
    expect(script).not.toMatch(/perl -0pe/);
    // The check runs before the psql session opens, and what runs is the
    // lexer's executed text, never the raw file.
    expect(script.indexOf('if ! findings="$(perl "$lexer" check')).toBeLessThan(script.indexOf('    echo "begin;"'));
    expect(script).toContain('    printf \'%s\\n\' "$executed"');
    expect(script).not.toMatch(/^ {4}cat "\$file"$/m);
    expect(script).toContain('test "$missing" = 0');

    // A recorded name is skipped only when the stored SQL equals the committed
    // file; otherwise the run stops. A re-apply refreshes the stored SQL in the
    // same transaction, and the final verification compares content too.
    // Every ledger predicate that reads or writes a row identifies the migration
    // by name or basename; a row sharing only the version is a conflict that
    // stops the run before anything is written.
    expect(script).toContain(`LEDGER_MATCH="(name = :'name' or name = :'base')"`);
    expect(script.match(/where \$LEDGER_MATCH/g)?.length).toBeGreaterThanOrEqual(5);
    expect(script).not.toMatch(/where name = :'name'[;)]/);
    expect(script).not.toMatch(/LEDGER_MATCH=.*version/);
    expect(script).toContain("where version = :'version' and not $LEDGER_MATCH;");
    expect(script).toMatch(/conflict="\$\(version_conflicts "\$name" "\$base" "\$version"\)"\n {2}if \[ -n "\$conflict" \]; then\n(?: {4}.+\n)* {4}exit 1/);
    expect(script.indexOf('conflict="$(version_conflicts')).toBeLessThan(script.indexOf('already="$('));
    // Symbolic links are never applied.
    expect(script).toContain('  if [ -L "supabase/migrations/$migration" ]; then');
    expect(script).toContain("select coalesce(statements[array_upper(statements, 1)], '') from supabase_migrations.schema_migrations where $LEDGER_MATCH order by version desc limit 1;");
    expect(script).toContain('    if [ "$(stored_sql "$name" "$base" "$version")" = "$(cat "$file")" ]; then');
    expect(script).toMatch(/echo "MISMATCH \$migration: name already in the \$TARGET ledger but its stored SQL differs from the committed file\." >&2\n(?:.*\n)? {4}exit 1/);
    // A re-apply appends evidence; it never overwrites what was applied before.
    // The ledger text travels inside the psql stdin stream as a dollar-quoted
    // literal under a tag the file does not contain, never as an argument
    // (Linux caps one argument at 128 KiB) and never as a psql variable.
    expect(script).toContain('  while grep -qF "\\$$tag\\$" "$file"; do tag="ledger_$RANDOM$RANDOM"; done');
    expect(script).not.toContain("--set=body=");
    expect(script).not.toContain(":'body'");
    // With LEDGER_PROVENANCE set (the production workflow does), one validated
    // line is stored just ahead of the file; the file stays the last element,
    // which is what every comparison reads. A file with no SQL is refused.
    expect(script).toContain('  recorded="\\$$tag\\$$body\\$$tag\\$"');
    expect(script).toContain('    recorded="\\$$tag\\$$LEDGER_PROVENANCE (file $migration)\\$$tag\\$, $recorded"');
    expect(script).toContain(`printf '%s\\n' "update supabase_migrations.schema_migrations set statements = coalesce(statements, '{}') || array[$recorded]"`);
    expect(script).toContain(`printf '%s\\n' "  select :'version', :'name', array[$recorded]"`);
    expect(script).toMatch(/if \[\[ "\$LEDGER_PROVENANCE" == \*\$'\\n'\* \]\] \|\| \[\[ "\$LEDGER_PROVENANCE" == \*'\$'\* \]\] \|\| \[\[ ! "\$LEDGER_PROVENANCE" =~ \^--\\ {2}\]\]; then\n {4}echo "Refusing LEDGER_PROVENANCE[^\n]*\n {4}exit 1/);
    expect(script).toMatch(/if \[ -z "\$\(perl "\$lexer" skeleton < "\$file" \| tr -d '\[:space:\]'\)" \]; then\n {4}echo "REFUSED \$migration: it contains no SQL statement[^\n]*\n {4}exit 1/);
    expect(stagingWorkflow).not.toContain("LEDGER_PROVENANCE");
    expect(script).not.toMatch(/set statements = array\[/);
    expect(script.indexOf("update supabase_migrations.schema_migrations set statements")).toBeLessThan(
      script.indexOf("insert into supabase_migrations.schema_migrations (version, name, statements)"),
    );
    expect(script).toContain('  elif [ "$(stored_sql "$name" "$base" "$version")" != "$(cat "supabase/migrations/$migration")" ]; then');
    // ADR 006 postcondition: read-only, must be exactly one boolean true.
    // The query runs inside a scalar subquery, so no separator can end the
    // read-only transaction, and semicolons are refused up front.
    // ... as the least-privileged `anon` role with a statement timeout: catalogs
    // readable, customer rows and server-signalling functions denied.
    expect(script).toContain(
      '      "set transaction read only;" \\\n      "set local statement_timeout = \'30s\';" \\\n      "set local role anon;" \\\n      "select (" \\\n      "$POSTCONDITION_SQL" \\\n      ") is true;" \\\n      "rollback;" |',
    );
    // A file listed twice would run twice under a re-apply: refused before any hosted command.
    expect(script).toContain('if [ "$(printf \'%s\\n\' "$@" | sort | uniq -d | wc -l | tr -d \' \')" != "0" ]; then');
    expect(script.indexOf("names the same file more than once")).toBeLessThan(script.indexOf("supabase db dump --linked"));
    expect(script).toContain('  POSTCONDITION_SQL="${POSTCONDITION_SQL%;}"');
    expect(script).toContain('if [[ "$POSTCONDITION_SQL" == *";"* ]] ||');
    // A re-apply name that is not in the list would never run: refused before any hosted command.
    const reapplyGate = script.indexOf("Refusing REAPPLY_MIGRATIONS entry");
    expect(reapplyGate).toBeGreaterThan(-1);
    expect(reapplyGate).toBeLessThan(script.indexOf("supabase db dump --linked"));
    expect(script).toContain('  if [ "$verdict" = "t" ]; then');
    expect(script).toContain('echo "POSTCONDITION FAILED: expected exactly \'t\', got \'${verdict:-nothing}\'" >&2');
    expect(script).toMatch(/\[\[ ! "\$POSTCONDITION_SQL" =~ \^\[\[:space:]]\*\[sS]\[eE]\[lL]\[eE]\[cC]\[tT]\[\[:space:]] ]]/);

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
    // Quoted, with a working-directory fallback: an unquoted path with a space
    // would stop the hook launching, and a launch failure is non-blocking.
    expect(matcher.hooks.map((h: { command: string }) => h.command)).toEqual([
      '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/guard-supabase-apply-migration.sh"',
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

describe("check-migrations-applied.yml binds the applied content", () => {
  // The production apply records the whole committed file as the SQL last
  // recorded on the ledger row, so the merge gate compares it with the file in
  // the pull request: a head pushed after the apply, the window the apply
  // itself cannot close, cannot merge different SQL under the applied name.
  it("asks prod for the SQL last recorded against the rows this change could match, and the provenance lines naming this pull request", () => {
    expect(gate).toContain(
      '            recorded_sql="case when version in ($in_versions) or name in ($in_names) then statements[array_upper(statements, 1)] end"',
    );
    expect(gate).toContain(
      "            provenance=\"(select string_agg(s, E'\\n') from unnest(coalesce(statements, '{}')) s where s like '-- applied to production from pull request #$PR_NUMBER head %')\"",
    );
    expect(gate).toContain(
      'query="select version, name, $recorded_sql as recorded_sql, $provenance as provenance from supabase_migrations.schema_migrations"',
    );
    expect(gate).toContain(`--data "$(jq -cn --arg query "$query" '{query: $query}')")`);
    expect(gate).not.toContain('--data \'{"query":"select version, name from');
    // Only validated names and a numeric pull request number are quoted into the query.
    expect(gate).toContain('            if [[ ! "$base" =~ ^[0-9]{14}_[a-z0-9_]+$ ]]; then');
    expect(gate).toContain('          if [[ -n "$PR_NUMBER" && ! "$PR_NUMBER" =~ ^[0-9]+$ ]]; then');
    expect(gate.indexOf('if [[ ! "$base" =~')).toBeLessThan(gate.indexOf('query="select version'));
    expect(gate.indexOf('if [[ -n "$PR_NUMBER" &&')).toBeLessThan(gate.indexOf('query="select version'));
    expect(gate).toContain("          PR_NUMBER: ${{ github.event.pull_request.number }}");
  });

  it("fails a file whose content differs from the recorded SQL (empty included) and still matches by name where nothing was recorded", () => {
    expect(gate).toContain('--rawfile file "$4"');
    expect(gate).not.toMatch(/--arg \w+ "\$\(cat /);
    expect(gate).toContain('[.[] | select(.version == $ver or .name == $name or .name == $base) | .recorded_sql | select(. != null) | sub("\\\\s+$"; "")]');
    expect(gate).not.toContain('(.recorded_sql // "")');
    expect(gate).toContain('| if length == 0 then "unrecorded"');
    expect(gate).toContain('elif any(. == ($file | sub("\\\\s+$"; ""))) then "match"');
    expect(gate).toMatch(/\*\)\n {18}echo "✗ CONTENT MISMATCH: \$base"\n(?: {18}.*\n)* {18}problems\+=\("\$base"\)/);
    expect(gate).toContain('unrecorded) echo "✓ applied: $base (matched by name; prod recorded no SQL to compare)" ;;');
    // The name matching the daily drift audit shares is unchanged.
    expect(gate).toContain('grep -qxF "$1" <<<"$applied_versions" || grep -qxF "$2" <<<"$applied_names" || grep -qxF "$3" <<<"$applied_names"');
  });

  it("refuses deleting, renaming or editing an applied migration (an edit restoring the recorded SQL aside)", () => {
    expect(gate).toContain(`deleted=$(git diff --name-only --no-renames --diff-filter=D "$range" -- supabase/migrations/ | grep '\\.sql$' || true)`);
    expect(gate).toContain(`added=$(git diff --name-only --no-renames --diff-filter=A "$range" -- supabase/migrations/ | grep '\\.sql$' || true)`);
    expect(gate).toContain(`modified=$(git diff --name-only --no-renames --diff-filter=M "$range" -- supabase/migrations/ | grep '\\.sql$' || true)`);
    expect(gate).toContain("          MODIFIED_FILES: ${{ steps.added.outputs.modified }}");
    expect(gate).toMatch(/echo "✗ REMOVED BUT APPLIED: \$base"\n(?: {14}.*\n)* {14}problems\+=\("\$base"\)/);
    expect(gate).toMatch(/elif \[ "\$\(content_verdict "\$ver" "\$name" "\$base" "\$f"\)" = "match" \]; then\n {14}echo "✓ edited to exactly the SQL prod recorded applying: \$base"/);
    expect(gate).toMatch(/echo "✗ EDITED BUT APPLIED: \$base"\n(?: {14}.*\n)* {14}problems\+=\("\$base"\)/);
    expect(gate).toContain('            if [ -n "$ADDED_FILES$DELETED_FILES$MODIFIED_FILES" ]; then');
  });

  it("requires the very file the production workflow applied from this pull request to stay in the tree", () => {
    expect(gate).toContain(`            tree=$(git ls-files -- 'supabase/migrations/*.sql' | sed 's#.*/##')`);
    expect(gate).toContain(`jq -r '.[] | .provenance | select(. != null)'`);
    expect(gate).toContain(`applied_file=$(printf '%s' "$line" | sed -n 's/.* (file \\([0-9]\\{14\\}_[a-z0-9_]*\\.sql\\))$/\\1/p')`);
    expect(gate).toMatch(/echo "✗ UNREADABLE PROVENANCE: \$line"\n {16}problems\+=\("provenance"\)/);
    expect(gate).toContain('              elif grep -qxF "$applied_file" <<<"$tree"; then');
    expect(gate).toMatch(/echo "✗ APPLIED FROM THIS PULL REQUEST BUT GONE: \$applied_file"\n(?: {16}.*\n)* {16}problems\+=\("\$applied_file"\)/);
    // Every pull request is verified (an applied file may have been dropped),
    // while a run with neither token nor migration changes (Dependabot) skips.
    expect(gate).toContain("        if: steps.added.outputs.touched != '' || github.event_name == 'pull_request'");
    expect(gate).toContain('            echo "No migration file changes and no token in this run (a Dependabot pull request) — nothing to verify. ✅"');
  });
});
