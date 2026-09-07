#!/usr/bin/env node
// Derive the name a migration must be recorded under from its filename.
//
// WHY THIS EXISTS
//
// check-migrations-applied.yml (every PR) and check-migrations-drift.yml
// (daily) decide whether a committed migration is applied on prod by matching
// its 14-digit version OR the part of its filename after the timestamp
// against supabase_migrations.schema_migrations. Applying via the Supabase MCP
// records the MCP's own timestamp as the version, so the NAME is the only
// thing that can match — and `apply_migration` takes it as free text.
//
// #790 was applied with the whole filename as its name. The cron jobs it
// creates were live; both checks reported it PENDING, and the daily audit
// would have alarmed every day until the ledger was corrected. #792 taught the
// checks to tolerate that one form. This script removes the typing: given the
// file, it prints the name, and refuses anything that is not a migration
// filename rather than guessing.
//
// The rule is the workflows' rule:
//   base=$(basename "$f" .sql); ver=${base%%_*}; name=${base#*_}
// and src/security/migrationName.test.ts runs that bash, extracted from both
// workflow files, against this function so the two cannot drift apart
// unnoticed. check-migrations.mjs imports the filename pattern from here, so
// the lint gate and this derivation are one definition.
//
// Usage:
//   npm run migration:name -- supabase/migrations/20260906120000_late_reminder_pass.sql
//   -> late_reminder_pass
//   npm run migration:name -- --json <file...>
//   -> [{ "path", "base", "version", "name" }]
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The one definition of a valid migration filename: a 14-digit timestamp, an
 * underscore, a snake_case name, `.sql`. The Supabase CLI silently skips files
 * it cannot parse, so anything looser is a migration that "ran" nowhere.
 */
export const MIGRATION_FILENAME_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export class MigrationNameError extends Error {}

/**
 * Derive `{ version, name, base }` from a migration path or basename.
 *
 * `base` is the filename without `.sql` — the workflows' `$base`, and the
 * third form the checks accept. `name` is what to pass to `apply_migration`.
 * Throws rather than returning a best effort, because a guessed name is the
 * exact failure this exists to prevent.
 */
export function deriveMigrationName(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new MigrationNameError("expected a migration file path");
  }
  const basename = path.basename(input);
  const match = MIGRATION_FILENAME_RE.exec(basename);
  if (!match) {
    throw new MigrationNameError(
      `${basename}: not a migration filename — expected <14-digit-timestamp>_<snake_case>.sql`,
    );
  }
  const [, version, name] = match;
  return { version, name, base: basename.slice(0, -".sql".length) };
}

/**
 * Files whose name (the part after the timestamp) is shared with another
 * file, as `[{ name, files }]`.
 *
 * The applied/drift checks match on name, so a shared name would let one
 * applied ledger row vouch for a migration that was never applied — a false
 * positive in the very check that exists to catch drift. Malformed filenames
 * are skipped here; they are check-migrations.mjs's own, louder, error.
 */
export function duplicateMigrationNames(basenames) {
  const byName = new Map();
  for (const basename of basenames) {
    let derived;
    try {
      derived = deriveMigrationName(basename);
    } catch {
      continue;
    }
    const files = byName.get(derived.name) ?? [];
    files.push(basename);
    byName.set(derived.name, files);
  }
  return [...byName.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({ name, files }));
}

function main(argv) {
  const json = argv.includes("--json");
  const files = argv.filter((arg) => arg !== "--json");
  if (files.length === 0) {
    process.stderr.write(
      "usage: node scripts/migration-name.mjs [--json] <migration.sql>...\n",
    );
    return 2;
  }

  const results = [];
  let failed = false;
  for (const file of files) {
    try {
      results.push({ path: file, ...deriveMigrationName(file) });
    } catch (error) {
      failed = true;
      process.stderr.write(`migration-name: ${error.message}\n`);
    }
  }
  if (failed) return 1;

  if (json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    for (const result of results) process.stdout.write(`${result.name}\n`);
  }
  return 0;
}

// Guarded so the pure helpers can be imported by tests and by
// check-migrations.mjs without running the CLI, matching check-sentry-live.mjs.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}
