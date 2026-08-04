// CI must keep type-checking the Edge Function entrypoints.
//
// Deno only type-checks modules reachable from the *.test.ts files it
// discovers, and nothing imports an index.ts — so without an explicit
// `deno check` step the entrypoints ship unchecked, and a `_shared/**` change
// redeploys every one of them. This guard fails if that step is removed, if
// the script it calls is renamed away, or if the two stop agreeing.
//
// Deliberately asserts on commands and ordering, never on line numbers or
// formatting, so reformatting the workflow doesn't produce a false alarm.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(
  join(root, ".github/workflows/ci.yml"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

const NPM_SCRIPT = "check:edge-types";
const SCRIPT_PATH = "scripts/check-edge-function-types.mjs";

describe("CI type-checks the Edge Function entrypoints", () => {
  it("runs the edge type-check somewhere in CI", () => {
    expect(workflow).toContain(`npm run ${NPM_SCRIPT}`);
  });

  it("keeps the npm script pointing at a script that exists", () => {
    // Catches the half-rename: CI still calls the npm script, the npm script
    // still names a file, but the file has moved.
    expect(packageJson.scripts[NPM_SCRIPT]).toContain(SCRIPT_PATH);
    expect(existsSync(join(root, SCRIPT_PATH))).toBe(true);
  });

  it("runs it in the agent-tests job, before the Deno test step", () => {
    const agentTests = workflow.indexOf("\n  agent-tests:");
    expect(agentTests).toBeGreaterThan(-1);

    // The next top-level job header bounds the agent-tests block. Two spaces
    // of indent + a name + colon is the job-header shape in this workflow.
    const nextJob = workflow.slice(agentTests + 1).search(/\n {2}[a-z][\w-]*:\n/);
    const block = nextJob === -1
      ? workflow.slice(agentTests)
      : workflow.slice(agentTests, agentTests + 1 + nextJob);

    const check = block.indexOf(`npm run ${NPM_SCRIPT}`);
    const test = block.indexOf("deno test --node-modules-dir=none");

    expect(check).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(-1);
    // Checking first surfaces a type error as a type error, and warms Deno's
    // remote-module cache for the test step that follows.
    expect(check).toBeLessThan(test);
  });

  it("does not give deno check runtime permissions it has no use for", () => {
    // `deno check` resolves and type-checks; it runs nothing. --allow-all on
    // this step would be pure blast radius.
    expect(workflow).not.toMatch(/deno check[^\n]*--allow-/);
    expect(workflow).not.toContain("--allow-all");
  });

  it("leaves the existing Deno test retry behaviour in place", () => {
    // The test step retries because the functions import supabase-js from
    // esm.sh and a CDN blip would otherwise red-X main. Removing that is a
    // separate decision, not a side effect of adding the type check.
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain(
      "deno test --node-modules-dir=none --allow-env supabase/functions/",
    );
  });
});
