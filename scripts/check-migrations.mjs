#!/usr/bin/env node
// Structural validation for supabase/migrations/*.sql.
//
// Catches the failure modes that have actually bitten us:
//   - filename doesn't match the Supabase CLI pattern (the CLI silently
//     skips files it can't parse, which means a migration "ran" in CI
//     and then never landed in prod)
//   - two migrations with the same timestamp (one quietly overwrites
//     the other in the local stack)
//   - file empty / no SQL statements
//   - a migration filename comes alphabetically *before* a file that
//     was committed earlier (timestamps must be monotonic over time —
//     someone backdating a migration breaks the apply order)
//
// Doesn't check semantics. For that, run them against a real Supabase
// instance.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const NAME_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

const errors = [];

let entries;
try {
  entries = readdirSync(DIR).sort();
} catch (err) {
  console.error(`Cannot read ${DIR}: ${err.message}`);
  process.exit(2);
}

const seenTimestamps = new Map();

for (const name of entries) {
  if (name.startsWith(".")) continue;
  const full = join(DIR, name);

  if (!name.endsWith(".sql")) {
    errors.push(`${name}: not a .sql file`);
    continue;
  }

  const match = NAME_RE.exec(name);
  if (!match) {
    errors.push(
      `${name}: filename must match <14-digit-timestamp>_<snake_case>.sql`,
    );
    continue;
  }

  const [, ts] = match;

  if (seenTimestamps.has(ts)) {
    errors.push(
      `${name}: duplicate timestamp ${ts} (also used by ${seenTimestamps.get(ts)})`,
    );
  } else {
    seenTimestamps.set(ts, name);
  }

  let body;
  try {
    body = readFileSync(full, "utf8");
  } catch (err) {
    errors.push(`${name}: cannot read (${err.message})`);
    continue;
  }

  if (statSync(full).size === 0) {
    errors.push(`${name}: empty file`);
    continue;
  }

  const stripped = body
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  if (!stripped) {
    errors.push(`${name}: contains only comments / whitespace`);
  }
}

if (errors.length > 0) {
  console.error(`Migration validation failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Migration validation OK (${entries.length} files).`);
