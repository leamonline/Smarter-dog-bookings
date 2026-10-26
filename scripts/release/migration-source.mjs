// PR trees are data only: never check them out or execute their tools/config.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = /^[a-f0-9]{40}$/;
const migration = /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/;
const git = (...args) => execFileSync('git', args, {maxBuffer:64 * 1024 * 1024});

function tree(revision) {
  const entries = git('ls-tree', '-r', '-z', revision, '--', 'supabase/migrations/').toString('utf8').split('\0').filter(Boolean);
  return entries.map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match || !migration.test(match[3])) throw Error('Migration tree contains a symlink, unsupported entry or invalid filename');
    return match[3];
  });
}

export function prepareMigrationSource(base, head, temporaryRoot) {
  if (!sha.test(base) || !sha.test(head)) throw Error('Expected exact base and head commit SHAs');
  // Validate both sides before paths become outputs, query values or filenames.
  tree(base);
  const paths = tree(head);
  const directory = mkdtempSync(join(temporaryRoot, 'migration-source-'));
  mkdirSync(join(directory, 'supabase/migrations'), {recursive:true, mode:0o700});
  for (const path of paths) {
    const sql = new TextDecoder('utf-8', {fatal:true}).decode(git('show', `${head}:${path}`));
    writeFileSync(join(directory, path), sql, {mode:0o600, flag:'wx'});
  }
  const changes = {};
  for (const [key, filter] of [['files','A'], ['deleted','D'], ['modified','MT']]) {
    const changed = git('diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', '--no-renames', `--diff-filter=${filter}`, `${base}...${head}`, '--', 'supabase/migrations/').toString('utf8').split('\0').filter(Boolean);
    if (changed.some(path => !migration.test(path))) throw Error('Invalid changed migration filename');
    changes[key] = changed.join('\n');
  }
  return {directory, ...changes, touched:Object.values(changes).some(Boolean) ? 'yes' : ''};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = prepareMigrationSource(process.env.BASE_SHA, process.env.SOURCE_SHA, process.env.RUNNER_TEMP);
    for (const [key, value] of Object.entries(result)) console.log(`${key}<<MIGRATION_SOURCE_OUTPUT\n${value}\nMIGRATION_SOURCE_OUTPUT`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
