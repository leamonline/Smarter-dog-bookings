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
});
