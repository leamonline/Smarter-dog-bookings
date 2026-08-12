// One Node major, declared in one place, enforced everywhere.
//
// WHY THIS EXISTS
//
// These four sources drifted apart without anything noticing:
//
//   .github/workflows/ci.yml        node-version: 20   (end-of-life April 2026)
//   .github/workflows/db-tests.yml  node-version: 22
//   .nvmrc                          20
//   Vercel project setting          24.x
//
// So CI validated every change on a runtime that production does not use and
// that Node itself no longer supports, while `@supabase/supabase-js` declared
// `engines.node: >=22.0.0` — a requirement CI was violating on every run. It
// stayed invisible because npm reports an engine mismatch as a warning unless
// `engine-strict` is set, and nothing compared the workflows to each other.
//
// This pins the invariant rather than the number: every workflow, `.nvmrc` and
// `package.json#engines` must agree on one major. Bumping Node means changing
// them together, which is the point.
//
// Vercel's own setting lives in the Vercel project, not the repo, so it cannot
// be asserted here — see docs/node-runtime.md.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const WORKFLOWS_DIR = join(root, ".github", "workflows");

/** Every `node-version:` pin across the workflows, with its file for context. */
function workflowNodeVersions(): { file: string; version: string }[] {
  const found: { file: string; version: string }[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).sort()) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    const source = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    for (const match of source.matchAll(/node-version:\s*['"]?([\w.]+)['"]?/g)) {
      found.push({ file, version: match[1] });
    }
  }
  return found;
}

function majorOf(version: string): string {
  return version.replace(/^v/, "").split(".")[0];
}

const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { engines?: { node?: string } };
const npmrc = readFileSync(join(root, ".npmrc"), "utf8");

describe("Node runtime is declared consistently", () => {
  it("declares a supported Node major in .nvmrc", () => {
    // Guards against the specific regression: Node 20 reached end of life in
    // April 2026, so it must never be what the repository asks for again.
    const major = Number(majorOf(nvmrc));
    expect(Number.isInteger(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(24);
  });

  it("pins a Node version in every workflow that runs Node", () => {
    const versions = workflowNodeVersions();
    // Fail loudly rather than vacuously passing if the pins are ever removed
    // or the workflow directory moves.
    expect(versions.length).toBeGreaterThan(0);
  });

  it("uses the same Node major in every workflow as .nvmrc", () => {
    const expected = majorOf(nvmrc);
    const mismatched = workflowNodeVersions().filter(
      ({ version }) => majorOf(version) !== expected,
    );
    // Named so the failure says which file disagrees, not just that one does.
    expect(mismatched).toEqual([]);
  });

  it("declares engines.node matching that major", () => {
    const declared = packageJson.engines?.node;
    expect(declared).toBeTruthy();
    expect(majorOf(declared!.replace(/^[^\d]*/, ""))).toBe(majorOf(nvmrc));
  });

  it("makes an engine mismatch fatal rather than a warning", () => {
    // Without engine-strict, `engines.node` is advisory: npm prints EBADENGINE
    // and installs anyway, which is how CI ran two majors behind production
    // while staying green.
    expect(npmrc).toMatch(/^engine-strict\s*=\s*true$/m);
  });
});
