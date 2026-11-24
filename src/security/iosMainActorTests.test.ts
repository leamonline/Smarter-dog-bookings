// A guard for the iPhone app's Swift tests on Linux CI.
//
// CI builds the Swift tests with Swift 6.0, which cannot list a plain (synchronous) test method
// from a test class that is marked `@MainActor`: the whole `auth-core` job then fails to build,
// even though a newer Swift on a Mac or a developer machine builds it fine. This has failed CI
// twice. Every test method in such a class has to be `async`.
//
// This test reads the Swift test files and fails, naming the file and line, if a `@MainActor`
// test class has a test method that is not `async`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "..", "ios", "AuthCoreTests");

/** Test methods without `async`, in classes marked `@MainActor`. */
export function syncTestsInMainActorClasses(source: string): Array<{ line: number; name: string }> {
  const lines = source.split("\n");
  const found: Array<{ line: number; name: string }> = [];
  let mainActorClass = false;
  let pendingMainActor = false;
  lines.forEach((text, index) => {
    if (/^\s*@MainActor\s*$/.test(text)) {
      pendingMainActor = true;
      return;
    }
    const classMatch = /^\s*(?:final\s+)?class\s+\w+\s*:\s*XCTestCase/.exec(text);
    if (classMatch) {
      mainActorClass = pendingMainActor || /@MainActor/.test(text);
      pendingMainActor = false;
      return;
    }
    if (!/^\s*@/.test(text)) pendingMainActor = false;
    const test = /^\s*func\s+(test\w*)\s*\([^)]*\)\s*(.*)\{/.exec(text);
    if (mainActorClass && test && !/\basync\b/.test(test[2])) {
      found.push({ line: index + 1, name: test[1] });
    }
  });
  return found;
}

describe("the iPhone app's Swift tests", () => {
  it("finds a synchronous test in a @MainActor class (the checker itself)", () => {
    const bad = [
      "@MainActor",
      "final class Sample: XCTestCase {",
      "    func testOne() async {",
      "    }",
      "    func testTwo() throws {",
      "    }",
      "}",
    ].join("\n");
    expect(syncTestsInMainActorClasses(bad)).toEqual([{ line: 5, name: "testTwo" }]);
  });

  it("allows synchronous tests in a class that is not @MainActor", () => {
    const fine = ["final class Plain: XCTestCase {", "    func testOne() throws {", "    }", "}"].join("\n");
    expect(syncTestsInMainActorClasses(fine)).toEqual([]);
  });

  it("has no synchronous test in any @MainActor test class", () => {
    const problems: string[] = [];
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".swift"))) {
      for (const hit of syncTestsInMainActorClasses(readFileSync(join(dir, file), "utf8"))) {
        problems.push(`${file}:${hit.line} ${hit.name} must be \`async\` (it is in a @MainActor class)`);
      }
    }
    expect(problems).toEqual([]);
  });
});
