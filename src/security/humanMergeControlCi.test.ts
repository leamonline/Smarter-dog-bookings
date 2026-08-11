import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflowPath = join(root, ".github/workflows/human-merge-control.yml");
const evaluatorPath = join(root, "scripts/human-merge-control.mjs");
const templatePath = join(root, ".github/pull_request_template.md");
const runbookPath = join(
  root,
  "docs/superpowers/runbooks/2026-08-11-human-merge-control.md",
);

const workflow = existsSync(workflowPath)
  ? readFileSync(workflowPath, "utf8")
  : "";
const template = readFileSync(templatePath, "utf8");
const evaluator = existsSync(evaluatorPath)
  ? readFileSync(evaluatorPath, "utf8")
  : "";

describe("human merge-control workflow boundary", () => {
  it("exists and runs unconditionally for every approval/reset PR event", () => {
    expect(existsSync(workflowPath)).toBe(true);
    expect(workflow).toContain("pull_request_target:");
    for (const type of [
      "opened",
      "reopened",
      "synchronize",
      "edited",
      "ready_for_review",
      "converted_to_draft",
    ]) {
      expect(workflow).toContain(`- ${type}`);
    }
    expect(workflow).not.toMatch(/^\s+if:/m);
  });

  it("uses least privilege and serialises events without cancellation", () => {
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("checks: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("statuses: write");
    expect(workflow).not.toMatch(/secrets\.[A-Za-z0-9_]+/);
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 5");
  });

  it("keeps commit-status write authority exclusive to the trusted publisher", () => {
    const workflowDirectory = join(root, ".github/workflows");
    const otherStatusWriters = readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/.test(name) && name !== "human-merge-control.yml")
      .filter((name) =>
        readFileSync(join(workflowDirectory, name), "utf8").includes(
          "statuses: write",
        ),
      );
    expect(otherStatusWriters).toEqual([]);
  });

  it("runs only the evaluator from the exact trusted base SHA", () => {
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(workflow).not.toContain("ref: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).not.toContain("npm ci");
    expect(workflow).not.toContain("npm install");
    expect(workflow).toContain("node scripts/human-merge-control.mjs");
    expect(workflow).toContain("GITHUB_TOKEN: ${{ github.token }}");
  });

  it("resets the exact head-bound context before checkout can fail", () => {
    const pendingStep = workflow.indexOf(
      "Reset head-bound control to pending before checkout",
    );
    const checkoutStep = workflow.indexOf("Check out trusted base evaluator");
    expect(pendingStep).toBeGreaterThan(-1);
    expect(checkoutStep).toBeGreaterThan(pendingStep);
    expect(workflow).toContain('context: "human-merge-control"');
    expect(workflow).toContain('state: "pending"');
    expect(workflow).not.toContain("${{ github.event.pull_request.body }}");
    expect(evaluator).toContain('const CONTROL_NAME = "human-merge-control"');
  });
});

describe("human merge-control pull-request surface", () => {
  it("contains one strict control block that defaults to HOLD", () => {
    expect(template.match(/<!-- human-merge-control:start -->/g)).toHaveLength(1);
    expect(template.match(/<!-- human-merge-control:end -->/g)).toHaveLength(1);
    expect(template).toContain("Decision: HOLD");
    expect(template).toContain("Approved head SHA:");
    expect(template).toContain("Approved base SHA:");
    expect(template).toContain("Approved by:");
    expect(template).toContain("Approved at (UTC):");
    expect(template).toContain("Migration review: HOLD");
  });

  it("links the durable operator runbook", () => {
    expect(existsSync(runbookPath)).toBe(true);
    expect(template).toContain(
      "docs/superpowers/runbooks/2026-08-11-human-merge-control.md",
    );
  });
});
