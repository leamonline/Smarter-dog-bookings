// The backup workflow's approval rule (#986, owner decision 19 Oct 2026).
// Scheduled runs skip review through their own main-only environment; every
// other trigger must still go through the reviewed `production` environment.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/database-backup.yml", import.meta.url)),
  "utf8",
);

describe("database-backup.yml approval rule", () => {
  it("routes only the schedule event to the unreviewed environment", () => {
    expect(workflow).toContain(
      "environment: ${{ github.event_name == 'schedule' && 'production-scheduled-backup' || 'production' }}",
    );
  });

  it("requires reviewers on production for any non-scheduled run", () => {
    expect(workflow).toMatch(/if \[ "\$env_name" = "production" \] && \[ "\$reviewers" -lt 1 \]; then/);
  });

  it("refuses the scheduled environment unless it deploys only from main", () => {
    expect(workflow).toContain('if [ "$branches" != "main" ]; then');
    expect(workflow).toContain(".custom_branch_policies == true");
  });

  it("keeps scheduled runs out of the manual runs' concurrency group", () => {
    expect(workflow).toContain(
      "group: database-backup-${{ github.event_name == 'schedule' && 'scheduled' || 'manual' }}",
    );
  });

  it("still runs only from main and only when enabled", () => {
    expect(workflow).toContain('if [ "$GITHUB_REF" != "refs/heads/main" ]; then');
    expect(workflow).toContain("if: ${{ vars.DATABASE_BACKUP_ENABLED == 'true' }}");
  });
});


describe("database-backup.yml file recovery", () => {
  it("preserves the SQL artifact before starting the independent Storage backup", () => {
    expect(workflow.indexOf("name: Keep the encrypted bundle for 90 days")).toBeLessThan(
      workflow.indexOf("name: Back up and encrypt Storage files"),
    );
    expect(workflow).toContain("if: ${{ always() && steps.dump.outcome == 'success' }}");
  });

  it("backs up file bytes on the explicit production target and retains only ciphertext", () => {
    expect(workflow).toContain("python3 scripts/operations/storage_archive.py backup");
    expect(workflow).toContain('--expected-project-ref "$PRODUCTION_PROJECT_REF"');
    expect(workflow).toContain("path: storage-backup-artifact/*.tar.gz.age");
    expect(workflow).toContain("if: ${{ always() && steps.storage.outcome == 'success' }}");
  });
});
