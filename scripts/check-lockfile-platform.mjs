#!/usr/bin/env node
// Guard: running `npm install` on macOS silently strips the Linux `libc`
// metadata (glibc / musl) from package-lock.json. npm only records libc for
// platforms it resolved locally, so a darwin install rewrites the lock and
// drops those fields from every Linux-only optional binary — currently 12
// packages (@supabase/cli-linux-*, @tailwindcss/oxide-linux-*, and friends).
//
// That matters because CI runs `npm ci` on ubuntu-latest. The lock is the
// contract that tells npm which prebuilt native binary a glibc vs musl runner
// should take; committing a darwin-stripped lock removes the only signal that
// distinguishes them.
//
// This has already happened twice: commit 61b75afb ("Regenerate package
// lockfile metadata", preserved on the codex/backup-accidental-main-2026-07-20
// branch) and again during the 2026-07-31 release, where the churn had to be
// backed out of two separate commits. Nothing else catches it — the diff is
// pure deletions inside a 379k-line JSON file that reviewers skim past.
//
// Fix when this fails: `git restore package-lock.json`. Locally prefer
// `npm ci` (which never writes the lockfile) over `npm install`. Only run
// `npm install` when you genuinely intend to change dependencies — and then
// check the diff contains your change and NOT a pile of "libc" deletions.

import { readFileSync } from "node:fs";

// Every Linux-only optional dependency that must keep its libc discriminator.
// A count rather than a fixed list: the set changes as dependencies move, but
// it should never collapse to zero, which is exactly what a darwin `npm
// install` does.
const MIN_EXPECTED_LIBC_PACKAGES = 8;

let lock;
try {
  lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
} catch (err) {
  console.error(`check-lockfile-platform: cannot read package-lock.json — ${err.message}`);
  process.exit(1);
}

const packages = lock.packages ?? {};
const withLibc = Object.entries(packages)
  .filter(([, meta]) => Array.isArray(meta?.libc) && meta.libc.length > 0)
  .map(([name]) => name);

if (withLibc.length < MIN_EXPECTED_LIBC_PACKAGES) {
  console.error(
    `\ncheck-lockfile-platform: package-lock.json has only ${withLibc.length} package(s) ` +
      `carrying Linux "libc" metadata (expected at least ${MIN_EXPECTED_LIBC_PACKAGES}).\n\n` +
      `This is what a macOS \`npm install\` does to the lockfile — it drops the glibc/musl\n` +
      `discriminator that CI's \`npm ci\` on ubuntu-latest needs to pick the right prebuilt\n` +
      `native binaries.\n\n` +
      `  Fix:  git restore package-lock.json\n` +
      `  Then: use \`npm ci\` locally instead of \`npm install\`.\n\n` +
      `If you deliberately changed dependencies, re-run the install on Linux (or let\n` +
      `Dependabot/CI regenerate the lock) so the platform metadata survives.\n`,
  );
  process.exit(1);
}

console.log(
  `Lockfile platform metadata OK (${withLibc.length} packages retain libc entries).`,
);
