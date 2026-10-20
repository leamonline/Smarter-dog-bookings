import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/run-hosted-pgtap.sh obtains a short-lived hosted database login, so
// its project boundary must not be weakened silently. These assertions used to
// live in the retired Tranche 1 workflow test (#998).
const runner = readFileSync(join(__dirname, "..", "..", "scripts", "run-hosted-pgtap.sh"), "utf8");
const productionRef = "nlzhllhkigmsvrzduefz";
const stagingRef = "btjnxvgkpdbfrrqxvkfj";

describe("hosted pgTAP runner target guard", () => {
  it("hard-codes the staging ref and refuses any other", () => {
    expect(runner).toContain(`EXPECTED_STAGING_PROJECT_REF="${stagingRef}"`);
    expect(runner).toContain('test "$STAGING_PROJECT_REF" = "$EXPECTED_STAGING_PROJECT_REF"');
  });

  it("names the production ref only to refuse it", () => {
    expect(runner).toContain(`PRODUCTION_PROJECT_REF="${productionRef}"`);
    expect(runner).toContain('test "$STAGING_PROJECT_REF" != "$PRODUCTION_PROJECT_REF"');
  });

  it("checks the linked project is staging before running anything", () => {
    expect(runner).toContain('test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"');
  });
});
