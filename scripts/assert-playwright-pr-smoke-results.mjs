import { readFile } from "node:fs/promises";

// The PR gate runs its two projects as separate Playwright invocations — see
// the comment in ci.yml — so each report holds one project and names it here.
// With no project named, both must be present, which is how a single combined
// report was checked before the invocations were split.
const [resultsPath, ...namedProjects] = process.argv.slice(2);
const requiredProjects = namedProjects.length
  ? namedProjects
  : ["desktop", "mobile-webkit"];

// The narrow-viewport run (changed specs on tablet and mobile — see ci.yml)
// sets PR_SMOKE_ALLOW_SKIPPED=1. A spec may gate itself on viewport, so a
// skip on a phone is the spec working as written, and a spec that skips every
// test there has nothing to prove on that project. Everywhere else a skipped
// test is the gate going quiet, and fails. It is an environment variable, not
// a flag, so an older copy of this script (a branch cut before the narrow run
// existed) ignores it rather than reading it as a project name.
const allowSkipped = process.env.PR_SMOKE_ALLOW_SKIPPED === "1";

if (!resultsPath) {
  throw new Error(
    "Usage: node scripts/assert-playwright-pr-smoke-results.mjs <results.json> [project...]",
  );
}

const report = JSON.parse(await readFile(resultsPath, "utf8"));
const tests = [];

function collectTests(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      tests.push(...(spec.tests ?? []));
    }
    collectTests(suite.suites);
  }
}

collectTests(report.suites);

if (tests.length === 0) {
  throw new Error("PR smoke gate discovered no tests.");
}

for (const projectName of requiredProjects) {
  const projectTests = tests.filter((test) => test.projectName === projectName);
  const skipped = projectTests.filter((test) =>
    test.results?.every((result) => result.status === "skipped"),
  );
  const passed = projectTests.filter((test) =>
    test.results?.some((result) => result.status === "passed"),
  );

  if (projectTests.length === 0) {
    throw new Error(`PR smoke gate ran no tests in ${projectName}.`);
  }

  if (skipped.length > 0 && !allowSkipped) {
    throw new Error(
      `PR smoke gate skipped ${skipped.length} test(s) in ${projectName}.`,
    );
  }

  const everyTestSkipped = skipped.length === projectTests.length;
  if (passed.length === 0 && !(allowSkipped && everyTestSkipped)) {
    throw new Error(`PR smoke gate had no passing tests in ${projectName}.`);
  }

  const skippedNote = skipped.length > 0 ? ` (${skipped.length} skipped)` : "";
  console.log(
    `PR smoke gate: ${projectName} passed ${passed.length}/${projectTests.length} tests${skippedNote}.`,
  );
}
