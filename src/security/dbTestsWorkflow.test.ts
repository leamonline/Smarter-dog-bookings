import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/db-tests.yml"),
  "utf8",
);

describe("DB Tests workflow production isolation", () => {
  it("cannot authenticate to or read from a hosted Supabase project", () => {
    expect(workflow).not.toMatch(
      /SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|PROJECT_REF)/,
    );
    expect(workflow).not.toMatch(
      /api\.supabase\.com|supabase link|supabase db dump|--linked\b/,
    );
    expect(workflow).not.toContain("nlzhllhkigmsvrzduefz");
    expect(workflow).not.toContain("btjnxvgkpdbfrrqxvkfj");
  });

  it("prepares and exercises only a disposable local Supabase project", () => {
    const prepare =
      'node scripts/prepare-db-test-project.mjs "$RUNNER_TEMP/db-test-project"';
    const start =
      'supabase --workdir "$RUNNER_TEMP/db-test-project" start';
    const test =
      'supabase --workdir "$RUNNER_TEMP/db-test-project" test db';

    expect(workflow).not.toContain("${{ runner.temp }}");
    expect(workflow).toContain(prepare);
    expect(workflow).toContain(start);
    expect(workflow).toContain(test);
    expect(workflow.indexOf(prepare)).toBeLessThan(workflow.indexOf(start));
    expect(workflow.indexOf(start)).toBeLessThan(workflow.indexOf(test));
  });
});
