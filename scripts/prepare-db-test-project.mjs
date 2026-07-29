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
  } else if (
    existsSync(join(sourceSupabase, "migrations", LOCAL_VAULT_MIGRATION))
  ) {
    fail(
      `${LOCAL_VAULT_MIGRATION} must remain CI-only and must not be committed`,
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
    writeFileSync(
      join(
        outputRoot,
        "supabase",
        "migrations",
        LOCAL_VAULT_MIGRATION,
      ),
      LOCAL_VAULT_SQL,
    );
    process.stdout.write(`${outputRoot}\n`);
  }
}
