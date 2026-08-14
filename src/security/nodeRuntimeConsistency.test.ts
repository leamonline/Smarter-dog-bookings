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
// This pins the invariant rather than the number: every workflow job that
// invokes Node/npm/npx must set up Node explicitly, every setup-node step must
// declare a version, and every declared version must agree with `.nvmrc` and
// `package.json#engines`. Bumping Node means changing them together.
//
// Vercel's own setting lives in the Vercel project, not the repo, so it cannot
// be asserted here — see docs/node-runtime.md.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const WORKFLOWS_DIR = join(root, ".github", "workflows");

type WorkflowJob = {
  file: string;
  job: string;
  source: string;
};

function workflowFiles(): { file: string; source: string }[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => ({
      file,
      source: readFileSync(join(WORKFLOWS_DIR, file), "utf8"),
    }));
}

/** Extract top-level jobs without adding a YAML parser dependency to the guard. */
function workflowJobs(): WorkflowJob[] {
  const found: WorkflowJob[] = [];

  for (const { file, source } of workflowFiles()) {
    let inJobs = false;
    let current: WorkflowJob | null = null;

    const finishCurrent = () => {
      if (current) found.push(current);
      current = null;
    };

    for (const line of source.split(/\r?\n/)) {
      if (/^jobs:\s*$/.test(line)) {
        inJobs = true;
        continue;
      }
      if (!inJobs) continue;

      // A new unindented key means the top-level jobs mapping has ended.
      if (/^\S/.test(line)) {
        finishCurrent();
        inJobs = false;
        continue;
      }

      const jobMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (jobMatch) {
        finishCurrent();
        current = { file, job: jobMatch[1], source: "" };
        continue;
      }

      if (current) current.source += `${line}\n`;
    }

    finishCurrent();
  }

  return found;
}

function executableSource(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

function jobInvokesNode(source: string): boolean {
  const executable = executableSource(source);
  // Match actual shell command invocations, not strings such as
  // `--node-modules-dir=none` in a Deno-only command.
  return /(?:^|[\s;&|($])(?:node|npm|npx)(?=\s|$)/m.test(executable);
}

function setupNodeCount(source: string): number {
  return [
    ...executableSource(source).matchAll(/uses:\s*actions\/setup-node@/g),
  ].length;
}

function nodeVersionCount(source: string): number {
  return [
    ...executableSource(source).matchAll(/node-version:\s*['"]?[\w.]+['"]?/g),
  ].length;
}

/** Every explicit `node-version:` pin, with its workflow job for context. */
function workflowNodeVersions(): { file: string; job: string; version: string }[] {
  const found: { file: string; job: string; version: string }[] = [];

  for (const { file, job, source } of workflowJobs()) {
    for (const match of executableSource(source).matchAll(
      /node-version:\s*['"]?([\w.]+)['"]?/g,
    )) {
      found.push({ file, job, version: match[1] });
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

  it("recognises direct Node invocations without confusing Deno flags for Node", () => {
    expect(jobInvokesNode("    steps:\n      - run: npm run test\n")).toBe(true);
    expect(jobInvokesNode("    steps:\n      - run: node script.mjs\n")).toBe(true);
    expect(
      jobInvokesNode(
        "    steps:\n      - run: deno test --node-modules-dir=none functions/\n",
      ),
    ).toBe(false);
  });

  it("pins Node in every workflow job that invokes node, npm or npx", () => {
    const unpinned = workflowJobs()
      .filter(({ source }) => jobInvokesNode(source) && setupNodeCount(source) === 0)
      .map(({ file, job }) => `${file}:${job}`);

    // No exemptions. The merge-control publisher was the last unpinned job and
    // this pull request pins it, so the expected list is now empty and any
    // future unpinned job fails here.
    expect(unpinned).toEqual([]);
  });

  it("gives every setup-node step an explicit node-version", () => {
    const incomplete = workflowJobs().flatMap(({ file, job, source }) => {
      const setupCount = setupNodeCount(source);
      const versionCount = nodeVersionCount(source);
      return setupCount === versionCount
        ? []
        : [`${file}:${job} setup-node=${setupCount} node-version=${versionCount}`];
    });

    // This is the missing-pin negative control: removing either setup-node from
    // a Node-using job or its node-version now makes the guard fail by name.
    expect(incomplete).toEqual([]);
  });

  it("uses the same Node major in every workflow as .nvmrc", () => {
    const versions = workflowNodeVersions();
    expect(versions.length).toBeGreaterThan(0);

    const expected = majorOf(nvmrc);
    const mismatched = versions
      .filter(({ version }) => majorOf(version) !== expected)
      .map(({ file, job, version }) => `${file}:${job}=${version}`);
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
