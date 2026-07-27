import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/db-tests.yml"),
  "utf8",
);

describe("DB Tests workflow authentication", () => {
  it("uses the access token for its schema-only dump without a database password", () => {
    expect(workflow).toContain(
      "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(workflow).toContain(
      'supabase link --project-ref "$SUPABASE_PROJECT_REF"',
    );
    expect(workflow).toContain("supabase db dump --linked");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("steps.gate.outputs.run");
  });

  it("removes target default table grants before restoring the schema dump", () => {
    const revoke =
      "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;";
    const aclBaseline =
      "supabase/migrations/00000000000000_target_acl_baseline.sql";
    const schemaBaseline =
      "supabase/migrations/00000000000001_prod_baseline.sql";

    expect(workflow).toContain(revoke);
    expect(workflow.indexOf(aclBaseline)).toBeLessThan(
      workflow.indexOf(schemaBaseline),
    );
  });
});
