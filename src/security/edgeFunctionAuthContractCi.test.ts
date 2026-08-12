// CI must keep enforcing the Edge Function auth contract.
//
// The manifest is only a control while something fails the build over it.
// Every function is deployed with --no-verify-jwt, so an unclassified function
// is an unreviewed public endpoint — and nothing else in the pipeline notices:
// `deno check` type-checks it happily and the Deno tests never import it.
// This guard fails if the step is removed, if the npm script is renamed away,
// or if the two stop agreeing.
//
// Deliberately asserts on commands and ordering, never on line numbers or
// formatting, so reformatting the workflow doesn't produce a false alarm.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const NPM_SCRIPT = "check:edge-auth";
const SCRIPT_PATH = "scripts/check-edge-function-auth.mjs";
const MANIFEST_PATH = "supabase/functions/_shared/authManifest.json";

describe("CI enforces the Edge Function auth contract", () => {
  it("runs the auth contract check somewhere in CI", () => {
    expect(workflow).toContain(`npm run ${NPM_SCRIPT}`);
  });

  it("keeps the npm script pointing at a script that exists", () => {
    // Catches the half-rename: CI still calls the npm script, the npm script
    // still names a file, but the file has moved.
    expect(packageJson.scripts[NPM_SCRIPT]).toContain(SCRIPT_PATH);
    expect(existsSync(join(root, SCRIPT_PATH))).toBe(true);
  });

  it("keeps the manifest the script reads in place", () => {
    expect(existsSync(join(root, MANIFEST_PATH))).toBe(true);
  });

  it("runs it in the agent-tests job", () => {
    const agentTests = workflow.indexOf("\n  agent-tests:");
    expect(agentTests).toBeGreaterThan(-1);

    // The next top-level job header bounds the agent-tests block. Two spaces
    // of indent + a name + colon is the job-header shape in this workflow.
    const nextJob = workflow.slice(agentTests + 1).search(/\n {2}[a-z][\w-]*:\n/);
    const block = nextJob === -1
      ? workflow.slice(agentTests)
      : workflow.slice(agentTests, agentTests + 1 + nextJob);

    expect(block).toContain(`npm run ${NPM_SCRIPT}`);
  });

  it("does not wrap the auth check in a retry loop", () => {
    // The Deno steps retry because they fetch modules from esm.sh and a CDN
    // blip would red-X main. This check makes no network calls, so retrying it
    // could only ever mask a real, deterministic failure.
    //
    // Scoped to this step's own block: the *next* step legitimately retries,
    // so a plain character window around the command would read that loop as
    // this step's and fail for the wrong reason.
    const stepIndex = workflow.indexOf(`npm run ${NPM_SCRIPT}`);
    expect(stepIndex).toBeGreaterThan(-1);

    const stepStart = workflow.lastIndexOf("\n      - name:", stepIndex);
    expect(stepStart).toBeGreaterThan(-1);

    const nextStep = workflow.slice(stepIndex).indexOf("\n      - name:");
    const block = nextStep === -1
      ? workflow.slice(stepStart)
      : workflow.slice(stepStart, stepIndex + nextStep);

    expect(block).toContain(`npm run ${NPM_SCRIPT}`);
    expect(block).not.toContain("for attempt in");
  });
});
