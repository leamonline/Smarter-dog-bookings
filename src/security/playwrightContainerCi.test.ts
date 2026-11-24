// The two browser jobs run inside Microsoft's Playwright image, not on a bare
// runner that installs Playwright's system libraries from Ubuntu's mirror.
//
// WHY THIS EXISTS
//
// On 24 November 2026 the Ubuntu package mirror GitHub's runners use fell to
// about 65 kB/s for an hour and a half. `playwright install-deps` then took
// 33 minutes to fetch 126 MB, on every pull request, whether or not the
// browsers came from cache. The image carries those libraries and browsers.
//
// What would quietly break it:
//   - an image tag that drifts from the locked @playwright/test version, so
//     the runner looks for browsers the image does not have;
//   - the required `pr-production-smoke` check being SKIPPED when the version
//     job fails, because a skipped job can satisfy a required check;
//   - someone re-adding an apt-based install step "to be safe".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");

/** One top-level job block of ci.yml, bounded by the next job header. */
function job(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

function executable(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

const BROWSER_JOBS = ["pr-production-smoke", "e2e"];

describe("CI browser jobs run in the Playwright image", () => {
  it("reads the version from the lockfile entry for @playwright/test", () => {
    const body = executable(job("playwright-version"));
    expect(body).toContain("version: ${{ steps.lockfile.outputs.version }}");
    expect(body).toContain('.packages["node_modules/@playwright/test"].version');
    expect(body).toContain("sparse-checkout: package-lock.json");
    // Fails rather than handing on an empty or malformed tag.
    expect(body).toMatch(/grep -Eq '\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$'/);

    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    expect(lock.packages["node_modules/@playwright/test"]?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  for (const name of BROWSER_JOBS) {
    it(`${name} uses the image tag for exactly that version`, () => {
      const body = executable(job(name));
      expect(body).toMatch(/^ {4}needs: playwright-version$/m);
      expect(body).toContain(
        "image: mcr.microsoft.com/playwright:v${{ needs.playwright-version.outputs.version }}-noble",
      );
      expect(body).toMatch(/^ {6}options: --user 1001 --ipc=host$/m);
    });

    it(`${name} still runs, and so fails, when the version job fails`, () => {
      const condition = executable(job(name)).match(/^ {4}if:\s*(.+)$/m)?.[1] ?? "";
      expect(condition).toMatch(/^\$\{\{ !cancelled\(\) && /);
    });

    it(`${name} installs nothing from apt and keeps no browser cache`, () => {
      const body = executable(job(name));
      expect(body).not.toMatch(/playwright install/);
      expect(body).not.toMatch(/apt(-get)?\s+install/);
      expect(body).not.toContain("ms-playwright");
    });
  }
});
