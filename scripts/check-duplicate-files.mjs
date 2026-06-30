#!/usr/bin/env node
// Guard: a file-sync / backup tool (iCloud Drive, Google Drive, Dropbox) running
// over a repo that lives inside a synced folder silently creates conflict copies
// named "<name> 2.ext", "<name> 3.ext", and so on. One such batch — 19
// byte-identical duplicates including 4 migrations and an edge function — was
// accidentally `git add`-ed and committed as 98d82c0 on 2026-06-30, and would
// have shipped to production on the next push. Nothing else catches these: to
// git, eslint, and tsc they look like ordinary new files.
//
// This fails `npm run lint` (exit 1) if any TRACKED file's name matches the
// conflict-copy shape, so a stray duplicate can never be merged silently again.
//
// It scans `git ls-files` rather than the filesystem on purpose: git-ignored
// build output (dist/, test-results/) routinely carries the same " 2"/" 3"
// copies, but only files actually committed to the repo are a problem worth
// failing the build over.
//
// No --fix: removing tracked files is destructive, and — unlike a sync tool's
// usual byte-identical copy — a "<name> 2.ext" file could rarely hold real
// divergent edits. Inspect each, then `git rm` it deliberately.
import { execFileSync } from "node:child_process";

// A sync-tool conflict marker right before the extension at the end of a file
// name. Two shapes are produced in the wild:
//   • iCloud / Dropbox / Finder:  " 2", " 3"   ("occupancy 2.ts", "icon-192 3.png")
//   • Google Drive Desktop:       " (1)", " (2)" ("occupancy (2).ts")
// The leading \S (a non-space immediately before the marker) requires a real
// base name in front of it: that skips a leading-space-only name (" 2.txt") and
// never matches an inline "(1)" with no space ("function(1).js"). The base name
// may itself end in a digit ("icon-180 3.png") — only the trailing, space-
// delimited marker counts.
const CONFLICT_RE = /\S (?:\d+|\(\d+\))\.[A-Za-z0-9]+$/;

let tracked;
try {
  // `-z` emits NUL-terminated paths; split on "\0" (not "\n") so names that
  // contain spaces — exactly what these conflict copies have — stay intact.
  tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
} catch (err) {
  console.error(
    `check-duplicate-files: could not run \`git ls-files\` — ${err.message}`,
  );
  process.exit(1);
}

const offenders = tracked.filter((path) => {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return CONFLICT_RE.test(base);
});

if (offenders.length > 0) {
  console.error('Tracked file-sync conflict copies detected (e.g. "name 2.ext"):\n');
  for (const path of offenders) console.error(`  ${path}`);
  console.error(
    `\n${offenders.length} duplicate file(s) are committed to the repo. These are almost\n` +
      "certainly conflict copies from a sync tool (iCloud / Google Drive / Dropbox)\n" +
      "running over the repo folder. Inspect each, then remove it with:\n" +
      '  git rm "<path>"\n' +
      "and keep the repo out of any synced folder so it stops recurring.",
  );
  process.exit(1);
}
