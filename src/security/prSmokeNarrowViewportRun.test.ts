// The pull-request gate must run the specs a pull request changes on the
// tablet and mobile projects, not only on desktop.
//
// A spec only exercised on narrow viewports after merge can pass its own pull
// request and then turn `e2e` red on main for every merge that follows — #894
// fixed a spec that had done exactly that for seven merges. This guard keeps
// the three parts that close that gap in place and agreeing with each other:
// the merged workflow selects the changed specs, a third Playwright
// invocation runs them on the full matrix's narrow projects, and the
// assertion script tolerates viewport-gated skips there and nowhere else.
//
// The selection step is executed for real (bash, with a fake `git` on PATH),
// because its rules — merge base not tip, deleted specs dropped, a config or
// helper change selects everything — are exactly what a regex on the YAML
// cannot check. Everything else asserts on commands and ordering, never on
// line numbers or formatting.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const playwrightConfig = readFileSync(join(root, "playwright.config.ts"), "utf8");

const ASSERT_SCRIPT = "scripts/assert-playwright-pr-smoke-results.mjs";
const SELECT_STEP_ID = "changed-specs";
const NARROW_STEP_NAME =
  "Run production-build PR suite — changed specs on tablet and mobile Chromium";

/** The `pr-production-smoke` job block, bounded by the next job header. */
function smokeJob(): string {
  const start = workflow.indexOf("\n  pr-production-smoke:");
  expect(start).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const nextJob = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
}

/** One `- name:`/`- uses:` step of a job, from its dash to the next step's dash. */
function step(job: string, marker: string): string {
  const at = job.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const stepStart = job.lastIndexOf("\n      - ", at);
  const next = job.indexOf("\n      - ", at);
  return job.slice(stepStart + 1, next === -1 ? undefined : next + 1);
}

/** The literal script under a step's `run: |`, dedented. */
function runBlock(stepSource: string): string {
  const lines = stepSource.split("\n");
  const runAt = lines.findIndex((line) => line === "        run: |");
  expect(runAt).toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== "" && !line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Run the selection step's script as CI would, with `git` replaced by a stub
 * that answers `merge-base` with a fixed SHA and `diff` with the given paths.
 * Returns the `specs=` line the step wrote to GITHUB_OUTPUT.
 */
function select(changedPaths: string[]): { specs: string; stdout: string; gitArgs: string } {
  const directory = mkdtempSync(join(tmpdir(), "sdb-pr-smoke-select-"));
  temporaryDirectories.push(directory);
  const output = join(directory, "github-output");
  const gitLog = join(directory, "git-args");
  const stub = join(directory, "git");
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${gitLog}"`,
      'case "$1" in',
      "  merge-base) echo 0123456789abcdef0123456789abcdef01234567 ;;",
      `  diff) [ -n "$FAKE_DIFF" ] && printf '%s\\n' $FAKE_DIFF ;;`,
      "  *) exit 64 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
  writeFileSync(output, "");

  const script = runBlock(step(smokeJob(), `id: ${SELECT_STEP_ID}`));
  const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      GITHUB_OUTPUT: output,
      BASE_REF: "main",
      FAKE_DIFF: changedPaths.join(" "),
    },
  });
  expect(result.status, result.stderr).toBe(0);

  const written = readFileSync(output, "utf8").trim();
  expect(written).toMatch(/^specs=/);
  return {
    specs: written.slice("specs=".length),
    stdout: result.stdout,
    gitArgs: readFileSync(gitLog, "utf8"),
  };
}

describe("the PR gate runs changed specs on tablet and mobile", () => {
  it("checks out full history, so the merge base with the base branch exists", () => {
    const checkout = step(smokeJob(), "uses: actions/checkout@v7");
    expect(checkout).toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(checkout).toMatch(/^\s+fetch-depth: 0$/m);
  });

  it("diffs the head against its merge base, dropping deleted files", () => {
    const { gitArgs } = select(["e2e/smoke.spec.ts"]);
    expect(gitArgs).toContain("merge-base origin/main HEAD");
    expect(gitArgs).toMatch(
      /diff --name-only --diff-filter=d 0123456789abcdef0123456789abcdef01234567 HEAD -- e2e playwright\.config\.ts/,
    );
  });

  it("selects only the changed specs, and nothing when none changed", () => {
    expect(select(["src/App.jsx", "e2e/partial-day-closures.spec.ts"]).specs).toBe(
      "e2e/partial-day-closures.spec.ts",
    );
    expect(select(["e2e/day-stack.spec.ts", "e2e/smoke.spec.ts"]).specs).toBe(
      "e2e/day-stack.spec.ts e2e/smoke.spec.ts",
    );
    const none = select([]);
    expect(none.specs).toBe("");
    expect(none.stdout).toContain("skipped");
  });

  it("selects every spec when the config or a non-spec e2e file changed", () => {
    expect(select(["playwright.config.ts"]).specs).toBe("all");
    expect(select(["e2e/helpers/calendar.ts", "e2e/smoke.spec.ts"]).specs).toBe("all");
  });

  it("runs the selection on the full matrix's tablet and mobile projects, only when there is one", () => {
    const narrow = step(smokeJob(), `name: ${NARROW_STEP_NAME}`);
    expect(narrow).toContain(`if: steps.${SELECT_STEP_ID}.outputs.specs != ''`);
    expect(narrow).toContain("--project=tablet --project=mobile");
    // The narrow projects come from the full matrix, which every live branch
    // carries; the PR-smoke matrix has never defined them.
    expect(narrow).not.toContain("PLAYWRIGHT_PR_SMOKE");
    // "all" means no file arguments; anything else is the space-separated list.
    expect(narrow).toContain('if [ "$SPECS" = all ]; then set --; else set -- $SPECS; fi');
    expect(narrow).toContain(`${ASSERT_SCRIPT} \\\n            pr-gate-results/pr-narrow-results.json tablet mobile`);
    expect(narrow).toMatch(/PR_SMOKE_ALLOW_SKIPPED: "1"/);

    for (const project of ["tablet", "mobile"]) {
      expect(playwrightConfig).toMatch(new RegExp(`name: "${project}"`));
    }
  });

  it("keeps the narrow run after the required desktop and WebKit invocations", () => {
    const job = smokeJob();
    const desktop = job.indexOf("every spec on desktop Chromium");
    const webkit = job.indexOf("smoke and viewport journeys on WebKit");
    const narrow = job.indexOf(NARROW_STEP_NAME);
    const upload = job.indexOf("Retain Playwright failure context");
    expect(desktop).toBeGreaterThan(-1);
    expect(webkit).toBeGreaterThan(desktop);
    expect(narrow).toBeGreaterThan(webkit);
    expect(upload).toBeGreaterThan(narrow);
  });

  it("allows viewport-gated skips only when the narrow run asks", () => {
    expect(existsSync(join(root, ASSERT_SCRIPT))).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), "sdb-pr-smoke-assert-"));
    temporaryDirectories.push(directory);

    const report = (tests: Array<{ project: string; status: "passed" | "skipped" }>) => ({
      suites: [
        {
          specs: [
            {
              tests: tests.map(({ project, status }) => ({
                projectName: project,
                results: [{ status }],
              })),
            },
          ],
        },
      ],
    });
    const run = (fixture: object, projects: string[], allowSkipped: boolean) => {
      const file = join(directory, `${projects.join("-")}-${allowSkipped}.json`);
      writeFileSync(file, JSON.stringify(fixture));
      return spawnSync(process.execPath, [join(root, ASSERT_SCRIPT), file, ...projects], {
        encoding: "utf8",
        env: { ...process.env, PR_SMOKE_ALLOW_SKIPPED: allowSkipped ? "1" : "" },
      });
    };

    const mixed = report([
      { project: "tablet", status: "passed" },
      { project: "tablet", status: "skipped" },
      { project: "mobile", status: "skipped" },
    ]);
    // Without the switch, the desktop and WebKit runs still fail on any skip.
    const strict = run(mixed, ["tablet"], false);
    expect(strict.status).not.toBe(0);
    expect(strict.stderr).toContain("skipped 1 test(s) in tablet");

    // With it, a skip is the spec's own viewport gate, and a project where
    // every test skipped has nothing to prove there.
    const lenient = run(mixed, ["tablet", "mobile"], true);
    expect(lenient.status, lenient.stderr).toBe(0);
    expect(lenient.stdout).toContain("tablet passed 1/2 tests (1 skipped)");
    expect(lenient.stdout).toContain("mobile passed 0/1 tests (1 skipped)");

    // The switch never excuses a project that ran nothing at all.
    const empty = run(mixed, ["desktop"], true);
    expect(empty.status).not.toBe(0);
    expect(empty.stderr).toContain("ran no tests in desktop");
  });
});
