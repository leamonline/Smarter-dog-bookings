#!/usr/bin/env node
// Guard linked hosted Supabase commands. A linked command gets its target from
// supabase/.temp/project-ref, so it must be immediately preceded by a
// read-only equality assertion. Keeping that assertion adjacent makes a later
// command insertion unable to inherit an unrelated, stale check.
//
// This scans every tracked repository file except generated/private history.
// It deliberately includes Markdown code blocks: an unsafe runbook command is
// still a repository command someone could paste into a shell.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const IGNORED_PREFIXES = ["docs/archive/", "docs/private/"];
const LINKED_COMMAND = /^\s*(?:npx\s+(?:--no-install\s+)?)?supabase\s+(?:db\s+(?:dump|push)|migration\s+(?:list|up|repair))\b.*\s--linked\b/;
const TARGET_ASSERTION = /^\s*test\s+"\$\(cat supabase\/\.temp\/project-ref\)"\s+=\s+"\$[A-Z0-9_]+"\s*$/;

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

function previousMeaningfulLine(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor];
    if (line.trim() && !line.trimStart().startsWith("#")) return line;
  }
  return "";
}

const violations = [];
for (const file of trackedFiles()) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!LINKED_COMMAND.test(line)) return;
    if (!TARGET_ASSERTION.test(previousMeaningfulLine(lines, index))) {
      violations.push(
        `${file}:${index + 1}: hosted --linked command must be immediately preceded by ` +
          '`test "$(cat supabase/.temp/project-ref)" = "$EXPECTED_PROJECT_REF"`',
      );
    }
  });
}

if (violations.length > 0) {
  console.error("Unguarded hosted Supabase linked command(s):");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log("Hosted Supabase target guard passed.");
