import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// These trees are intentionally outside the current knowledge surface:
// - archive: historical links may preserve a former repository layout;
// - private: not general repository knowledge and may contain sensitive notes;
// - docs-stubs: generated design-component output, not authored documentation.
export const excludedMarkdownPrefixes = [
  "docs/archive/",
  "docs/private/",
  ".design-sync/docs-stubs/",
];

function repositoryPath(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

export function filterGovernedMarkdownFiles(fileNames) {
  return [...new Set(fileNames.map(repositoryPath))]
    .filter((file) => file.endsWith(".md"))
    .filter(
      (file) =>
        !excludedMarkdownPrefixes.some(
          (prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix),
        ),
    )
    .sort();
}

export function discoverGovernedMarkdownFiles(
  repositoryRoot = defaultRepositoryRoot,
) {
  const output = execFileSync(
    "git",
    [
      "-C",
      repositoryRoot,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.md",
    ],
    { encoding: "utf8" },
  );

  return filterGovernedMarkdownFiles(output.split("\n").filter(Boolean))
    .map((file) => path.resolve(repositoryRoot, file))
    .filter((file) => fs.existsSync(file));
}

function markdownOutsideFences(source) {
  let fence = null;
  return source
    .split("\n")
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1][0];
        else if (marker[1][0] === fence) fence = null;
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
}

function markdownOutsideCode(source) {
  return markdownOutsideFences(source).replace(/(`+)([\s\S]*?)\1/g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function normaliseReference(label) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function headingSlug(heading) {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39);/gi, "")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function markdownAnchors(file, markdownCache) {
  if (markdownCache.has(file)) return markdownCache.get(file);

  const source = markdownOutsideFences(fs.readFileSync(file, "utf8"));
  const anchors = new Set();
  const duplicateCounts = new Map();

  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = headingSlug(match[1]);
    if (!base) continue;
    const count = duplicateCounts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    duplicateCounts.set(base, count + 1);
  }

  for (const match of source.matchAll(
    /<a\s+[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi,
  )) {
    anchors.add(match[1]);
  }

  markdownCache.set(file, anchors);
  return anchors;
}

function splitTarget(rawTarget) {
  const hashIndex = rawTarget.indexOf("#");
  const beforeHash = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
  const queryIndex = beforeHash.indexOf("?");
  return {
    pathPart: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    fragment: hashIndex >= 0 ? rawTarget.slice(hashIndex + 1) : "",
  };
}

function recordFailure(failures, file, source, offset, target, reason) {
  failures.push({
    file,
    line: lineNumber(source, offset),
    target,
    reason,
  });
}

function validateTarget({
  encodedTarget,
  failures,
  file,
  markdownCache,
  offset,
  repositoryRoot,
  source,
}) {
  if (
    !encodedTarget ||
    encodedTarget.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(encodedTarget)
  ) {
    return;
  }

  const { pathPart, fragment: encodedFragment } = splitTarget(encodedTarget);
  let decodedPath;
  let fragment;
  try {
    decodedPath = decodeURIComponent(pathPart);
    fragment = decodeURIComponent(encodedFragment);
  } catch {
    recordFailure(
      failures,
      file,
      source,
      offset,
      encodedTarget,
      "invalid URI encoding",
    );
    return;
  }

  if (path.isAbsolute(decodedPath)) {
    recordFailure(
      failures,
      file,
      source,
      offset,
      encodedTarget,
      "absolute repository link",
    );
    return;
  }

  let resolved = decodedPath ? path.resolve(path.dirname(file), decodedPath) : file;
  const withinRepository =
    resolved === repositoryRoot ||
    resolved.startsWith(`${repositoryRoot}${path.sep}`);
  if (!withinRepository || !fs.existsSync(resolved)) {
    recordFailure(
      failures,
      file,
      source,
      offset,
      encodedTarget,
      "target not found",
    );
    return;
  }

  if (fs.statSync(resolved).isDirectory() && fragment) {
    const readme = path.join(resolved, "README.md");
    if (fs.existsSync(readme)) resolved = readme;
  }

  if (!fragment) return;
  if (!resolved.endsWith(".md")) {
    if (!/^L\d+(?:-L\d+)?$/.test(fragment)) {
      recordFailure(
        failures,
        file,
        source,
        offset,
        encodedTarget,
        "unsupported non-Markdown fragment",
      );
    }
    return;
  }

  if (!markdownAnchors(resolved, markdownCache).has(fragment)) {
    recordFailure(
      failures,
      file,
      source,
      offset,
      encodedTarget,
      "heading anchor not found",
    );
  }
}

export function validateMarkdownFiles({ repositoryRoot, files }) {
  const failures = [];
  const markdownCache = new Map();

  for (const file of files) {
    const source = markdownOutsideCode(fs.readFileSync(file, "utf8"));
    const definitions = new Map();
    const definitionPattern =
      /^ {0,3}\[([^\]^][^\]]*)\]:\s*(?:<([^>]+)>|(\S+))/gm;

    for (const match of source.matchAll(definitionPattern)) {
      const target = match[2] ?? match[3];
      definitions.set(normaliseReference(match[1]), target);
      validateTarget({
        encodedTarget: target,
        failures,
        file,
        markdownCache,
        offset: match.index,
        repositoryRoot,
        source,
      });
    }

    const inlineLinkPattern =
      /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g;
    for (const match of source.matchAll(inlineLinkPattern)) {
      validateTarget({
        encodedTarget: match[1] ?? match[2],
        failures,
        file,
        markdownCache,
        offset: match.index,
        repositoryRoot,
        source,
      });
    }

    const explicitReferencePattern = /!?\[([^\]]+)\]\[([^\]]*)\]/g;
    for (const match of source.matchAll(explicitReferencePattern)) {
      const label = normaliseReference(match[2] || match[1]);
      if (!definitions.has(label)) {
        recordFailure(
          failures,
          file,
          source,
          match.index,
          match[0],
          "reference definition not found",
        );
      }
    }
  }

  return failures;
}

export function checkDocumentation(repositoryRoot = defaultRepositoryRoot) {
  const files = discoverGovernedMarkdownFiles(repositoryRoot);
  const failures = validateMarkdownFiles({ repositoryRoot, files });
  return { failures, files };
}

function run() {
  const { failures, files } = checkDocumentation();
  if (failures.length > 0) {
    console.error("Broken links in governed documentation:");
    for (const failure of failures) {
      console.error(
        `- ${path.relative(defaultRepositoryRoot, failure.file)}:${failure.line} -> ${failure.target} (${failure.reason})`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Documentation links and heading anchors OK (${files.length} governed Markdown files).`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}
