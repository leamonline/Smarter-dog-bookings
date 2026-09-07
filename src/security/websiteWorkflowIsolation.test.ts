// The marketing website under website/ is an independent application in this
// repository (ADR 009). Two things must stay true, and nothing else checks
// them:
//
//   1. Isolation. Root tooling (ESLint, Vitest, tsc, Playwright, the build)
//      never discovers website/, and the website's checks never run on a
//      bookings change. Required bookings checks still run on website-only
//      PRs: workflow selection must not leave Protect main waiting forever.
//      Their lint, test and build inputs remain scoped to bookings.
//
//   2. Publishing safety. The website workflow can never deploy Edge
//      Functions, can never run its publisher from a pull request, and its
//      Bluehost deploy job stays dark until the repository variable
//      WEBSITE_PUBLISHER_ENABLED is set at the authorised cutover
//      (docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md).
//      Until then the original repository remains the single publisher.
//
// The change-selection table below simulates GitHub's `paths` /
// `paths-ignore` filters against each workflow's triggers, so "a website-only
// change still reports required repository checks" is asserted, not assumed. It reads the
// YAML with the same deliberately small regex approach the other workflow
// guards use rather than adding a parser dependency.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

const WEBSITE_WORKFLOW = ".github/workflows/website.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const EDGE_DEPLOY_WORKFLOW = ".github/workflows/deploy-edge-functions.yml";
const DB_TESTS_WORKFLOW = ".github/workflows/db-tests.yml";

const website = read(WEBSITE_WORKFLOW);
const ci = read(CI_WORKFLOW);
const edgeDeploy = read(EDGE_DEPLOY_WORKFLOW);
const dbTests = read(DB_TESTS_WORKFLOW);
const migrations = read(".github/workflows/check-migrations-applied.yml");

/** Lines of a top-level YAML block (`key:` at column 0) until the next top-level key. */
function topLevelBlock(source: string, key: string): string[] {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line));
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    body.push(line);
  }
  return body;
}

/** Lines of one indented sub-block (e.g. `  push:` inside `on:`). */
function subBlock(lines: string[], indent: number, key: string): string[] {
  const prefix = " ".repeat(indent);
  const start = lines.findIndex((line) => line === `${prefix}${key}:` || line === `${prefix}${key}: {}`);
  if (start === -1) return [];
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const lineIndent = line.match(/^ */)![0].length;
    if (lineIndent <= indent) break;
    body.push(line);
  }
  return body;
}

/** `- 'item'` list entries under a key inside a block; null when the key is absent. */
function listUnder(lines: string[], key: string): string[] | null {
  const start = lines.findIndex((line) => new RegExp(`^\\s*${key}:\\s*(\\[.*\\])?\\s*$`).test(line));
  if (start === -1) return null;
  const inline = lines[start].match(/\[(.*)\]/);
  if (inline) {
    return inline[1]
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  const keyIndent = lines[start].match(/^ */)![0].length;
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const lineIndent = line.match(/^ */)![0].length;
    if (lineIndent <= keyIndent) break;
    const item = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
    if (item) items.push(item[1]);
  }
  return items;
}

type Trigger = { paths: string[] | null; pathsIgnore: string[] | null };

function trigger(source: string, event: "push" | "pull_request"): Trigger | null {
  const on = topLevelBlock(source, "on");
  const hasEvent = on.some((line) => new RegExp(`^ {2}${event}:`).test(line));
  if (!hasEvent) return null;
  const block = subBlock(on, 2, event);
  return { paths: listUnder(block, "paths"), pathsIgnore: listUnder(block, "paths-ignore") };
}

/** GitHub Actions path-filter glob → RegExp (`**` any depth, `*` within a segment). */
function globToRegExp(glob: string): RegExp {
  // Placeholders first so the single-star pass cannot rewrite the `.*`
  // that the double-star pass has just produced.
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\uE000")
    .replace(/\*\*/g, "\uE001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\uE000/g, "(?:.*/)?")
    .replace(/\uE001/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Does GitHub run this workflow for `event` given these changed files? */
function workflowRuns(source: string, event: "push" | "pull_request", changed: string[]): boolean {
  const filter = trigger(source, event);
  if (!filter) return false;
  if (filter.paths) {
    const patterns = filter.paths.map(globToRegExp);
    return changed.some((file) => patterns.some((pattern) => pattern.test(file)));
  }
  if (filter.pathsIgnore) {
    const patterns = filter.pathsIgnore.map(globToRegExp);
    return changed.some((file) => !patterns.some((pattern) => pattern.test(file)));
  }
  return true;
}

function job(source: string, name: string): string {
  return subBlock(topLevelBlock(source, "jobs"), 2, name).join("\n");
}

function executable(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

describe("the website is an independent application in this repository", () => {
  it("keeps its own manifest, lockfile and configs under website/", () => {
    for (const file of [
      "website/package.json",
      "website/package-lock.json",
      "website/vite.config.js",
      "website/vitest.config.js",
      "website/playwright.config.js",
      "website/eslint.config.js",
    ]) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
    expect(JSON.parse(read("website/package.json")).name).toBe("smarter-dog-website");
  });

  it("has no nested .github tree — only root workflows run, so a nested copy would be a silent lie", () => {
    expect(existsSync(join(root, "website/.github"))).toBe(false);
  });

  it("is never an npm workspace of the root (ADR 009 keeps the installs separate)", () => {
    const rootPackage = JSON.parse(read("package.json"));
    expect(rootPackage.workspaces).toBeUndefined();
  });

  it("is reachable from the root only through explicit --prefix website scripts", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    const websiteScripts = Object.entries(scripts).filter(([name]) => name.startsWith("website:"));
    expect(websiteScripts.map(([name]) => name)).toEqual(
      expect.arrayContaining(["website:install", "website:lint", "website:test", "website:build"]),
    );
    for (const [name, command] of websiteScripts) {
      expect(command, name).toMatch(/^npm (ci |)--prefix website\b/);
    }
  });
});

describe("root tooling never discovers website/", () => {
  it("ESLint ignores website/** (the website has its own flat config)", () => {
    const ignoresBlock = read("eslint.config.js").match(/ignores:\s*\[([\s\S]*?)\]/);
    expect(ignoresBlock).not.toBeNull();
    expect(ignoresBlock![1]).toMatch(/["']website\/\*\*["']/);
  });

  it("Vitest excludes website/** from both projects", () => {
    const config = read("vitest.config.ts");
    const excludes = [...config.matchAll(/exclude:\s*\[([^\]]*)\]/g)].map((match) => match[1]);
    const withWebsite = excludes.filter((list) => /["']website\/\*\*["']/.test(list));
    // The logic and component projects each carry the exclusion; the coverage
    // block does not need it because its `include` is already src/-scoped.
    expect(withWebsite.length).toBeGreaterThanOrEqual(2);
  });

  it("tsc includes only src/ (both configs) and Playwright reads only ./e2e", () => {
    for (const file of ["tsconfig.json", "tsconfig.node-tests.json"]) {
      const include = JSON.parse(read(file)).include as string[];
      for (const pattern of include) expect(pattern, file).not.toMatch(/website/);
    }
    expect(read("playwright.config.ts")).toMatch(/testDir:\s*["']\.\/e2e["']/);
  });

  it("does not let the root build read website assets (root index.html and public/ only)", () => {
    const viteConfig = read("vite.config.js");
    expect(viteConfig).not.toMatch(/website/);
    expect(existsSync(join(root, "website/public"))).toBe(true);
    expect(existsSync(join(root, "public/assets/client-dog-1.jpg"))).toBe(false);
  });
});

describe("the website workflow is scoped and cannot publish without the cutover", () => {
  it("only website/** and the workflow itself trigger it, on push and pull_request", () => {
    for (const event of ["push", "pull_request"] as const) {
      const filter = trigger(website, event);
      expect(filter, event).not.toBeNull();
      expect(filter!.paths?.sort()).toEqual(["website/**", WEBSITE_WORKFLOW].sort());
      expect(filter!.pathsIgnore).toBeNull();
    }
  });

  it("runs every job from website/ with its own lockfile", () => {
    expect(website).toMatch(/^defaults:\n {2}run:\n {4}working-directory: website$/m);
    const setupNodes = [...executable(website).matchAll(/cache-dependency-path:\s*(\S+)/g)];
    expect(setupNodes.length).toBeGreaterThan(0);
    for (const match of setupNodes) expect(match[1]).toBe("website/package-lock.json");
  });

  it("runs mocked holiday E2E scenarios without production configuration", () => {
    const e2e = executable(job(website, "e2e"));
    expect(e2e).toContain("VITE_SUPABASE_URL: https://website-ci.invalid");
    expect(e2e).toContain("VITE_SUPABASE_PUBLISHABLE_KEY: ci-public-placeholder");
    expect(e2e).not.toContain("secrets.");
  });

  it("never holds the Supabase token, never deploys Edge Functions and never links a project", () => {
    const source = executable(website);
    expect(source).not.toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(source).not.toMatch(/supabase\s+functions\s+deploy/);
    expect(source).not.toMatch(/--project-ref/);
    expect(source).not.toMatch(/supabase\/setup-cli/);
  });

  it("gates the deploy job on push + main + WEBSITE_PUBLISHER_ENABLED == 'true'", () => {
    const deploy = executable(job(website, "deploy"));
    expect(deploy).not.toBe("");
    const condition = deploy.match(/^\s*if:\s*(.+)$/m)?.[1] ?? "";
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).toContain("vars.WEBSITE_PUBLISHER_ENABLED == 'true'");
    // All three joined by AND — an OR anywhere would let one condition
    // publish on its own.
    expect(condition).not.toMatch(/\|\|/);
    expect(condition.split("&&")).toHaveLength(3);
  });

  it("publishes only the website build, never wipes the target and needs every check first", () => {
    const deploy = executable(job(website, "deploy"));
    expect(deploy).toMatch(/needs:\s*\[test, build, e2e\]/);
    expect(deploy).toMatch(/local-dir:\s*\.\/website\/dist\//);
    expect(deploy).toMatch(/dangerous-clean-slate:\s*false/);
    expect(deploy).toMatch(/protocol:\s*ftps/);
    expect(deploy).not.toMatch(/local-dir:\s*\.\/dist\//);
  });

  it("gives the workflow read-only contents permission", () => {
    expect(website).toMatch(/^permissions:\n {2}contents: read$/m);
  });
});

describe("CI change selection preserves required checks and release isolation", () => {
  const scenarios: {
    name: string;
    changed: string[];
    expected: { website: boolean; ci: boolean; edgeDeploy: boolean; dbTests: boolean };
  }[] = [
    {
      name: "website-only",
      changed: ["website/src/App.jsx", "website/package-lock.json", "website/public/llms.txt"],
      expected: { website: true, ci: true, edgeDeploy: false, dbTests: false },
    },
    {
      name: "bookings-only",
      changed: ["src/engine/capacity.ts", "src/App.jsx", "package-lock.json"],
      expected: { website: false, ci: true, edgeDeploy: false, dbTests: false },
    },
    {
      name: "shared workflow/configuration",
      changed: [".github/workflows/website.yml", "eslint.config.js"],
      expected: { website: true, ci: true, edgeDeploy: false, dbTests: false },
    },
    {
      name: "documentation-only",
      changed: ["docs/README.md", "CHANGELOG.md"],
      expected: { website: false, ci: true, edgeDeploy: false, dbTests: false },
    },
    {
      name: "website documentation-only",
      changed: ["website/MAINTENANCE.md"],
      expected: { website: true, ci: true, edgeDeploy: false, dbTests: false },
    },
    {
      name: "Supabase-only (Edge Function)",
      changed: ["supabase/functions/whatsapp-agent/handler.ts"],
      expected: { website: false, ci: true, edgeDeploy: true, dbTests: false },
    },
    {
      name: "Supabase-only (migration)",
      changed: ["supabase/migrations/20260907000000_example.sql"],
      expected: { website: false, ci: true, edgeDeploy: false, dbTests: true },
    },
  ];

  for (const { name, changed, expected } of scenarios) {
    it(`push to main — ${name}`, () => {
      expect({
        website: workflowRuns(website, "push", changed),
        ci: workflowRuns(ci, "push", changed),
        edgeDeploy: workflowRuns(edgeDeploy, "push", changed),
        dbTests: workflowRuns(dbTests, "push", changed),
      }).toEqual(expected);
    });

    it(`pull request — ${name} (release jobs never run from a pull request)`, () => {
      expect({
        website: workflowRuns(website, "pull_request", changed),
        ci: workflowRuns(ci, "pull_request", changed),
        edgeDeploy: workflowRuns(edgeDeploy, "pull_request", changed),
        dbTests: workflowRuns(dbTests, "pull_request", changed),
      }).toEqual({ ...expected, edgeDeploy: false });
    });
  }

  it("the Edge Function publisher is path-filtered to supabase/functions/** and has no pull_request trigger", () => {
    expect(trigger(edgeDeploy, "pull_request")).toBeNull();
    expect(trigger(edgeDeploy, "push")?.paths?.sort()).toEqual(
      ["supabase/functions/**", EDGE_DEPLOY_WORKFLOW].sort(),
    );
  });

  it("all required workflows report for every PR without path filters", () => {
    for (const source of [ci, migrations]) {
      for (const event of ["push", "pull_request"] as const) {
        expect(trigger(source, event)).toEqual({ paths: null, pathsIgnore: null });
      }
      expect(workflowRuns(source, "pull_request", ["website/src/App.jsx"])).toBe(true);
    }
  });

  it("preserves required job names and does not condition them on changed paths", () => {
    for (const name of ["build", "coverage", "agent-tests", "pr-production-smoke", "migrations-applied"]) {
      const source = name === "migrations-applied" ? migrations : ci;
      const body = executable(job(source, name));
      expect(body, name).not.toBe("");
      // No display-name override: the ruleset requires these exact contexts.
      expect(body, name).not.toMatch(/^ {4}name:/m);
      const condition = body.match(/^ {4}if:\s*(.+)$/m)?.[1];
      expect(condition, name).toBe(name === "pr-production-smoke" ? "github.event_name == 'pull_request'" : undefined);
    }
  });

  it("website checks cannot impersonate required bookings contexts", () => {
    for (const name of ["test", "build", "e2e"]) {
      expect(job(website, name)).toMatch(new RegExp(`^ {4}name: website-${name}$`, "m"));
    }
  });

  it("the glob translation matches GitHub's path-filter semantics", () => {
    expect(globToRegExp("website/**").test("website/src/App.jsx")).toBe(true);
    expect(globToRegExp("website/**").test("src/website.ts")).toBe(false);
    expect(globToRegExp("supabase/functions/**").test("supabase/functions/_shared/x.ts")).toBe(true);
    expect(globToRegExp("supabase/functions/**").test("supabase/migrations/x.sql")).toBe(false);
    expect(globToRegExp("*.md").test("docs/README.md")).toBe(false);
    expect(globToRegExp("**/*.md").test("docs/README.md")).toBe(true);
  });
});
