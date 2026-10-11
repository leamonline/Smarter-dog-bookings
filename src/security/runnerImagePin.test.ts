import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// GitHub moves the `ubuntu-latest` label to Ubuntu 26 from 19 October 2026
// (actions/runner-images#14748). The pgTAP job depends on Docker and the
// Supabase CLI, the E2E jobs on Playwright's system libraries, and the
// lockfile platform guard on the runner's libc flavour, so a silent image
// change is the most likely way for CI to break without a code change.
// Every job therefore names an explicit image; moving to a newer one is a
// deliberate, reviewed edit of this list.

const root = process.cwd();
const WORKFLOWS_DIR = join(root, ".github", "workflows");
const PINNED_IMAGE = "ubuntu-24.04";

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
}

/** Every `runs-on:` value in a workflow, with its line for the failure message. */
function runsOnValues(source: string): Array<{ line: number; value: string }> {
  return source.split(/\r?\n/).flatMap((text, index) => {
    const match = /^\s*runs-on:\s*(.+?)\s*$/.exec(text);
    return match ? [{ line: index + 1, value: match[1] }] : [];
  });
}

describe("GitHub Actions runner image pin", () => {
  it("names a runner on every job, never a floating label", () => {
    const files = workflowFiles();
    expect(files.length).toBeGreaterThan(0);

    const floating = files.flatMap((file) =>
      runsOnValues(readFileSync(join(WORKFLOWS_DIR, file), "utf8"))
        .filter(({ value }) => value !== PINNED_IMAGE)
        .map(({ line, value }) => `${file}:${line} runs-on=${value}`),
    );

    expect(floating, `every runs-on must be ${PINNED_IMAGE}`).toEqual([]);
  });

  it("does not mention ubuntu-latest anywhere in a workflow", () => {
    const mentions = workflowFiles().filter((file) =>
      readFileSync(join(WORKFLOWS_DIR, file), "utf8").includes("ubuntu-latest"),
    );
    expect(mentions).toEqual([]);
  });
});
