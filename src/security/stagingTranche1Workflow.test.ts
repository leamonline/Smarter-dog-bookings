import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(
  join(root, ".github/workflows/staging-tranche1-smoke.yml"),
  "utf8",
);
const testsReadme = readFileSync(
  join(root, "supabase/tests/README.md"),
  "utf8",
);

const productionRef = "nlzhllhkigmsvrzduefz";
const stagingRef = "btjnxvgkpdbfrrqxvkfj";
const candidateMigration =
  "20260712115759_legal_risk_tranche1.sql";
const targetAssertion =
  'test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"';

function positionOf(needle: string): number {
  expect(workflow, `expected workflow to contain: ${needle}`).toContain(needle);
  return workflow.indexOf(needle);
}

describe("Tranche 1 staging provision workflow", () => {
  it("is manual-only, approval-bound and non-cancelling", () => {
    const triggerStart = positionOf("on:\n");
    const triggerEnd = positionOf("\npermissions:");
    const trigger = workflow.slice(triggerStart, triggerEnd);

    expect(trigger).toMatch(
      /^on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}confirm_staging_ref:\n(?: {8}.+\n)* {8}required: true\n {8}type: string$/m,
    );
    expect(trigger).not.toMatch(/^ {2}(?:push|pull_request|schedule):/m);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(
      /concurrency:\n {2}group: staging-tranche1-smoke\n {2}cancel-in-progress: false/,
    );
    expect(workflow).toContain("    environment: staging");
  });

  it("makes exact target confirmation the first step", () => {
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
      "          CONFIRM_STAGING_REF: ${{ inputs.confirm_staging_ref }}",
    );
    expect(workflow).toContain(
      '          if [ "$CONFIRM_STAGING_REF" != "$STAGING_PROJECT_REF" ]; then',
    );
    expect(workflow).toContain(
      '          if [ "$STAGING_PROJECT_REF" = "$PRODUCTION_PROJECT_REF" ]; then',
    );
  });

  it("pins the requested actions and uses access-token-only authentication", () => {
    expect(workflow).toContain("uses: actions/checkout@v7");
    expect(workflow).toContain("uses: supabase/setup-cli@v2");
    expect(workflow).toContain("          version: 2.109.1");

    const secretNames = Array.from(
      workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*}}/g),
      (match) => match[1],
    );
    expect([...new Set(secretNames)]).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(workflow).not.toMatch(
      /SUPABASE_DB_PASSWORD|DATABASE_URL|SERVICE_ROLE|--password\b/i,
    );
  });

  it("preserves only the candidate and builds a schema-only baseline", () => {
    expect(workflow).toContain(
      `      CANDIDATE_MIGRATION: ${candidateMigration}`,
    );
    expect(workflow).toContain(
      'cp -- "supabase/migrations/$CANDIDATE_MIGRATION" "$CANDIDATE_COPY"',
    );

    const productionLink = positionOf(
      'supabase link --project-ref "$PRODUCTION_PROJECT_REF"',
    );
    const dump = positionOf("supabase db dump --linked \\");
    const prelude = positionOf(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;",
    );
    const append = positionOf(
      "cat /tmp/prod-schema.sql >> /tmp/prod-baseline.sql",
    );

    expect(workflow).toContain("--schema public,smarter_dog_private \\");
    expect(workflow).toContain("--file /tmp/prod-schema.sql");
    expect(workflow).not.toMatch(
      /--data-only|--role-only|--include-seed|supabase (?:db )?seed\b/,
    );
    expect(productionLink).toBeLessThan(dump);
    expect(dump).toBeLessThan(prelude);
    expect(prelude).toBeLessThan(append);

    expect(workflow).toContain(
      "cp -- /tmp/prod-baseline.sql supabase/migrations/00000000000000_prod_baseline.sql",
    );
    expect(workflow).toContain(
      'cp -- "$CANDIDATE_COPY" "supabase/migrations/$CANDIDATE_MIGRATION"',
    );
  });

  it("relinks and repeatedly proves the staging target before remote commands", () => {
    const stagingLink = positionOf(
      'supabase link --project-ref "$STAGING_PROJECT_REF"',
    );
    const migrationList = positionOf("supabase migration list --linked");
    const dryRun = positionOf(
      "supabase db push --linked --include-all --dry-run",
    );
    const actualPush = positionOf(
      "supabase db push --linked --include-all --yes",
    );
    const pgTap = positionOf("supabase test db --linked \\");

    expect(stagingLink).toBeLessThan(migrationList);
    expect(migrationList).toBeLessThan(dryRun);
    expect(dryRun).toBeLessThan(actualPush);
    expect(actualPush).toBeLessThan(pgTap);
    expect(workflow).toContain(
      `${targetAssertion}\n          supabase db push --linked --include-all --dry-run`,
    );
    expect(workflow).toContain(
      `${targetAssertion}\n          supabase db push --linked --include-all --yes`,
    );
    expect(workflow).toContain(
      `${targetAssertion}\n          supabase test db --linked \\`,
    );
    expect(workflow.split(targetAssertion)).toHaveLength(5);
  });

  it("runs exactly the four canonical pgTAP files and no deployment or seed", () => {
    const pgTapPaths = Array.from(
      workflow.matchAll(/supabase\/tests\/[^\s\\]+\.test\.sql/g),
      (match) => match[0],
    );

    expect(pgTapPaths).toEqual([
      "supabase/tests/100_customer_write_permissions.test.sql",
      "supabase/tests/120_trusted_contact_lock.test.sql",
      "supabase/tests/110_customer_cancellation.test.sql",
      "supabase/tests/115_customer_cancellation_concurrency.test.sql",
    ]);
    expect(workflow).not.toMatch(
      /supabase functions deploy|vercel (?:deploy|--prod)|npm run seed|supabase (?:db )?seed\b/i,
    );
  });

  it("documents access-token temporary login without a database password", () => {
    expect(testsReadme).toContain("`SUPABASE_ACCESS_TOKEN`");
    expect(testsReadme).toMatch(/short-lived database login/i);
    expect(testsReadme).not.toContain("SUPABASE_DB_PASSWORD");
  });
});
