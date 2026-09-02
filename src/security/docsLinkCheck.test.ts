import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverGovernedMarkdownFiles,
  filterGovernedMarkdownFiles,
  validateMarkdownFiles,
} from "../../scripts/check-doc-links.mjs";

const temporaryDirectories: string[] = [];

function fixtureDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sdb-doc-links-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("documentation link governance", () => {
  it("discovers current Markdown repository-wide and excludes only declared historical, private and generated trees", () => {
    expect(
      filterGovernedMarkdownFiles([
        "README.md",
        "ROADMAP.md",
        ".design-sync/conventions.md",
        "supabase/tests/README.md",
        "docs/archive/old.md",
        "docs/private/notes.md",
        ".design-sync/docs-stubs/Button.md",
        "src/not-markdown.ts",
      ]),
    ).toEqual([
      ".design-sync/conventions.md",
      "README.md",
      "ROADMAP.md",
      "supabase/tests/README.md",
    ]);

    const repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const discovered = discoverGovernedMarkdownFiles(repositoryRoot).map((file) =>
      path.relative(repositoryRoot, file).split(path.sep).join("/"),
    );
    expect(discovered).toEqual(
      expect.arrayContaining([
        ".design-sync/conventions.md",
        "ROADMAP.md",
        "supabase/tests/README.md",
      ]),
    );
  });

  it("rejects a link to a missing Markdown heading", () => {
    const repositoryRoot = fixtureDirectory();
    const source = path.join(repositoryRoot, "source.md");
    const target = path.join(repositoryRoot, "target.md");
    fs.writeFileSync(source, "[Target](target.md#missing-heading)\n");
    fs.writeFileSync(target, "# Existing heading\n");

    expect(
      validateMarkdownFiles({ repositoryRoot, files: [source, target] }),
    ).toEqual([
      expect.objectContaining({
        file: source,
        line: 1,
        reason: "heading anchor not found",
        target: "target.md#missing-heading",
      }),
    ]);
  });

  it("rejects an undefined reference-style link", () => {
    const repositoryRoot = fixtureDirectory();
    const source = path.join(repositoryRoot, "source.md");
    fs.writeFileSync(source, "Read [the guide][missing].\n");

    expect(validateMarkdownFiles({ repositoryRoot, files: [source] })).toEqual([
      expect.objectContaining({
        file: source,
        line: 1,
        reason: "reference definition not found",
        target: "[the guide][missing]",
      }),
    ]);
  });
});
