import { readFile } from "node:fs/promises";

const [resultsPath] = process.argv.slice(2);
const requiredProjects = ["desktop", "mobile-webkit"];

if (!resultsPath) {
  throw new Error(
    "Usage: node scripts/assert-playwright-pr-smoke-results.mjs <results.json>",
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
