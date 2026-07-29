import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

const LEGACY_API_PRIVILEGES_MIGRATION =
  "20260330000000_ci_legacy_api_default_privileges.sql";
const LEGACY_API_PRIVILEGES_SQL = `-- CI-only prerequisite for a disposable local database.
--
-- This project predates Supabase's May 2026 switch to closed-by-default Data
-- API table privileges. Its historical migrations therefore rely on the
-- legacy project default: public tables receive CRUD grants, then RLS and
-- later explicit REVOKEs narrow access. Modern disposable projects no longer
-- inherit that default, so reproduce the original project environment before
-- replaying history. This file exists only in the copied test project.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;
`;

const LOCAL_VAULT_MIGRATION =
  "20260510235859_ci_local_vault_prerequisite.sql";
const LOCAL_VAULT_SQL = `-- CI-only prerequisite for a disposable local database.
--
-- The following committed migration deliberately fails closed when the
-- project-specific supabase_url secret is absent. Production receives that
-- secret out of band. Local migration replay receives this inert loopback
-- value in the copied test project only.
do $ci_local_vault$
begin
  if not exists (
    select 1 from vault.secrets where name = 'supabase_url'
  ) then
    perform vault.create_secret(
      'http://localhost:54321',
      'supabase_url',
      'CI-only local migration prerequisite'
    );
  end if;
end;
$ci_local_vault$;
`;

const EXPLICIT_API_PRIVILEGES_MIGRATION =
  "20260729000000_ci_require_explicit_api_privileges.sql";
const EXPLICIT_API_PRIVILEGES_SQL = `-- CI-only boundary for future migrations.
--
-- Historical migrations above this point are replayed with the legacy Data
-- API defaults the production project received. Stop inheriting those defaults
-- after the history present when isolated CI was adopted: every later table
-- must declare its intended API privileges explicitly alongside its RLS.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;
`;

const CI_ONLY_MIGRATIONS = [
  [LEGACY_API_PRIVILEGES_MIGRATION, LEGACY_API_PRIVILEGES_SQL],
  [LOCAL_VAULT_MIGRATION, LOCAL_VAULT_SQL],
  [EXPLICIT_API_PRIVILEGES_MIGRATION, EXPLICIT_API_PRIVILEGES_SQL],
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function canonicaliseProspectivePath(path) {
  let existingAncestor = path;
  const missingSegments = [];

  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }

  return join(realpathSync(existingAncestor), ...missingSegments);
}

const outputArgument = process.argv[2];
if (!outputArgument || process.argv.length !== 3) {
  fail("Usage: node scripts/prepare-db-test-project.mjs <output-root>");
} else {
  const sourceRoot = realpathSync(process.cwd());
  const sourceSupabase = join(sourceRoot, "supabase");
  const outputRoot = resolve(outputArgument);
  const canonicalOutput = canonicaliseProspectivePath(outputRoot);
  const relativeOutput = relative(sourceRoot, canonicalOutput);
  const outputIsInsideSource =
    relativeOutput === "" ||
    (!relativeOutput.startsWith("..") && !isAbsolute(relativeOutput));

  if (outputIsInsideSource) {
    fail("Output must be outside the source project");
  } else if (!existsSync(join(sourceSupabase, "config.toml"))) {
    fail(`Supabase project not found at ${sourceSupabase}`);
  } else if (existsSync(outputRoot)) {
    fail(`Output already exists: ${outputRoot}`);
  } else {
    const committedCiMigration = CI_ONLY_MIGRATIONS.find(([name]) =>
      existsSync(join(sourceSupabase, "migrations", name)),
    );

    if (committedCiMigration) {
      fail(
        `${committedCiMigration[0]} must remain CI-only and must not be committed`,
      );
    } else {
      mkdirSync(dirname(outputRoot), { recursive: true });
      mkdirSync(outputRoot);
      cpSync(sourceSupabase, join(outputRoot, "supabase"), {
        recursive: true,
        filter(source) {
          const sourceRelative = relative(sourceSupabase, source);
          return !sourceRelative
            .split("/")
            .some((part) => part === ".temp" || part === ".branches");
        },
      });
      for (const [name, sql] of CI_ONLY_MIGRATIONS) {
        writeFileSync(
          join(outputRoot, "supabase", "migrations", name),
          sql,
        );
      }
      process.stdout.write(`${outputRoot}\n`);
    }
  }
}
