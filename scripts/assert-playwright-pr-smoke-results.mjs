import { readFile } from "node:fs/promises";

// The PR gate runs its two projects as separate Playwright invocations — see
// the comment in ci.yml — so each report holds one project and names it here.
// With no project named, both must be present, which is how a single combined
// report was checked before the invocations were split.
const [resultsPath, ...namedProjects] = process.argv.slice(2);
const requiredProjects = namedProjects.length
  ? namedProjects
  : ["desktop", "mobile-webkit"];

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

  if (skipped.length > 0) {
    throw new Error(
      `PR smoke gate skipped ${skipped.length} test(s) in ${projectName}.`,
    );
  }

  if (passed.length === 0) {
    throw new Error(`PR smoke gate had no passing tests in ${projectName}.`);
  }

  console.log(
    `PR smoke gate: ${projectName} passed ${passed.length}/${projectTests.length} tests.`,
  );
}
