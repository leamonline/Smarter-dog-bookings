// One psql process owns the advisory lock, every file transaction and verification.
// No connection string, password or database output is placed in a receipt.
import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

export const LOCK_KEY = '73194621851015';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const filename = /^[0-9]{14}_[a-z0-9_]+\.sql$/;
const lexer = fileURLToPath(new URL('../lex-migration-sql.pl', import.meta.url));
export function literal(value) {
  let tag;
  do { tag = `$release_${randomBytes(12).toString('hex')}$`; } while (value.includes(tag));
  return `${tag}${value}${tag}`;
}
export function postcondition(query) {
  if (typeof query !== 'string' || !/^\s*select\s/i.test(query) || /[;\\\0]/.test(query)) throw Error('Postcondition must be one SELECT without semicolons or backslashes');
  return query;
}
export function executable(sql) {
  const lex = (mode, input) => {
    const result = spawnSync('perl', [lexer, mode], { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw Error('Migration SQL lexer refused input');
    return result.stdout;
  };
  lex('check', sql);
  const executed = lex('executed', sql);
  if (!lex('skeleton', executed).trim()) throw Error('Empty migration');
  return executed;
}
export function compile({ migrations, reapply = [], provenance = '', query, digest }) {
  if (!migrations.length || new Set(migrations.map(m => m.name)).size !== migrations.length) throw Error('Empty or duplicate migration list');
  if (new Set(reapply).size !== reapply.length || reapply.some(n => !migrations.some(m => m.name === n))) throw Error('Invalid reapply subset');
  if (provenance && (!provenance.startsWith('-- ') || /[\n\r$]/.test(provenance))) throw Error('Invalid provenance');
  if (digest && !/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid release digest');
  if (query) postcondition(query);
  const finalChecks = [];
  const lines = ['\\set ON_ERROR_STOP on', 'set role postgres;', `do $$ begin if not pg_try_advisory_lock(${LOCK_KEY}::bigint) then raise exception 'Another migration release owns the database lock'; end if; end $$;`];
  if (digest) lines.push('begin;', `insert into release_control.attempts(digest) values (${literal(digest)});`, 'commit;', '\\echo RELEASE_CLAIMED');

  for (const migration of migrations) {
    if (!filename.test(migration.name) || typeof migration.sql !== 'string' || migration.sql.includes('\0')) throw Error('Invalid migration');
    const sql = executable(migration.sql);
    const base = migration.name.slice(0, -4), name = base.slice(15), version = base.slice(0, 14);
    const match = `(name=${literal(name)} or name=${literal(base)})`;
    // Legacy engine strips trailing newlines in shell command substitution.
    // Preserve that comparison compatibility; new ledger records retain all bytes.
    const recorded = literal(migration.sql);
    const equal = `rtrim(coalesce(statements[array_upper(statements,1)], ''), E'\\n')=rtrim(${recorded}, E'\\n')`;
    const marker = `${provenance || '-- local migration apply'}${digest ? ` release-sha256 ${digest}` : ''} (file ${migration.name})`;
    finalChecks.push(`do $$ begin if (select count(*) from supabase_migrations.schema_migrations where ${match} and ${equal})<>1 or (select count(*) from supabase_migrations.schema_migrations where ${match})<>1 then raise exception 'Final ledger verification failed'; end if; end $$;`);
    lines.push(`select 'RELEASE_BEFORE ${migration.name} ' || count(*)::text || ' ' || coalesce(min(encode(sha256(convert_to(coalesce(statements[array_upper(statements,1)], ''),'UTF8')),'hex')), '-') from supabase_migrations.schema_migrations where ${match};`, `\\echo RELEASE_START ${migration.name}`, 'begin;',
      `do $$ begin if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(version)} and not ${match}) then raise exception 'Ledger version conflict'; end if; if (select count(*) from supabase_migrations.schema_migrations where ${match})>1 then raise exception 'Multiple ledger identities'; end if; end $$;`,
      `select exists(select 1 from supabase_migrations.schema_migrations where ${match}) as already \\gset`, '\\if :already');
    if (!reapply.includes(migration.name)) {
      lines.push(`do $$ begin if not exists(select 1 from supabase_migrations.schema_migrations where ${match} and ${equal}) then raise exception 'Ledger SQL mismatch'; end if; end $$;`);
    }
    lines.push('\\endif');
    if (!reapply.includes(migration.name)) lines.push('\\if :already', '\\else');
    lines.push('\\o /dev/null', { sql }, '\\o');
    if (!reapply.includes(migration.name)) lines.push('\\endif');
    lines.push(`update supabase_migrations.schema_migrations set statements=coalesce(statements,'{}') || array[${literal(marker)},${recorded}] where ${match};`,
      `insert into supabase_migrations.schema_migrations(version,name,statements) select ${literal(version)},${literal(name)},array[${literal(marker)},${recorded}] where not exists(select 1 from supabase_migrations.schema_migrations where ${match});`,
      `do $$ begin if (select count(*) from supabase_migrations.schema_migrations where ${match} and ${equal})<>1 then raise exception 'Ledger verification failed'; end if; end $$;`, 'commit;');
    if (!reapply.includes(migration.name)) lines.push('\\if :already', `\\echo RELEASE_SKIPPED ${migration.name}`, '\\else', `\\echo RELEASE_APPLIED ${migration.name}`, '\\endif');
    else lines.push(`\\echo RELEASE_APPLIED ${migration.name}`);
  }
  lines.push(...finalChecks, '\\echo RELEASE_LEDGER_VERIFIED');
  if (query) lines.push('begin read only;', "set local statement_timeout='30s';", 'set local role anon;', `select coalesce((${query}) is true,false) as verified \\gset`, '\\if :verified', 'rollback;', '\\echo RELEASE_VERIFIED', '\\else', 'rollback;', "do $$ begin raise exception 'Postcondition failed'; end $$;", '\\endif');
  if (digest) lines.push(`update release_control.attempts set outcome='succeeded', finished_at=clock_timestamp() where digest=${literal(digest)};`);
  lines.push(`select pg_advisory_unlock(${LOCK_KEY}::bigint);`);
  let blockTag;
  do { blockTag = `$guard_${randomBytes(16).toString('hex')}$`; } while (lines.some(line => (typeof line === 'string' ? line : line.sql).includes(blockTag)));
  return lines.map(line => typeof line !== 'string' ? line.sql : line.startsWith('do $$') ? line.replace(/^do \$\$/, `do ${blockTag}`).replace(/end \$\$;$/, `end ${blockTag};`) : line).join('\n') + '\n';
}

export async function apply(options, env = process.env) {
  const sql = compile(options); // Validate every file before any connection.
  const outcome = { status: 'unknown', files: options.migrations.map(m => ({ name: m.name, sha256: sha256(m.sql), outcome: 'not_started' })) };
  const child = spawn('psql', ['-X', '-A', '-t', '-q', '--file', '-'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = '';
  const parse = line => {
    const before = /^RELEASE_BEFORE ([0-9]{14}_[a-z0-9_]+\.sql) ([0-9]+) ([a-f0-9]{64}|-)$/.exec(line);
    if (before) { const item = outcome.files.find(m => m.name === before[1]); if (item) item.before = { rows: Number(before[2]), lastSqlSha256: before[3] === '-' ? null : before[3] }; }
    if (line === 'RELEASE_LEDGER_VERIFIED') outcome.ledgerVerified = true;
    const match = /^RELEASE_(START|SKIPPED|APPLIED) ([0-9]{14}_[a-z0-9_]+\.sql)$/.exec(line);
    if (match) { const item = outcome.files.find(m => m.name === match[2]); if (item) item.outcome = ({ START: 'unknown', SKIPPED: 'skipped', APPLIED: 'applied' })[match[1]]; }
    if (line === 'RELEASE_VERIFIED') outcome.postcondition = true;
  };
  child.stdout.on('data', data => { pending += data; const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(parse); });
  // Never echo arbitrary database errors: SQL errors can include customer rows/secrets.
  child.stderr.resume();
  // SIGINT makes psql send PostgreSQL's cancel request. SIGTERM alone can
  // abandon a running backend holding the lock until its statement completes.
  const interrupt = () => child.kill('SIGINT');
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  child.stdin.on('error', () => {});
  child.stdin.end(sql);
  await new Promise(resolve => { child.on('error', resolve); child.on('close', code => { parse(pending); outcome.status = code === 0 && outcome.ledgerVerified && (!options.query || outcome.postcondition) ? 'succeeded' : 'reconciliation_required'; if (code === 3) outcome.files.filter(m => m.outcome === 'unknown').forEach(m => m.outcome = 'failed'); resolve(); }); });
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  return outcome;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const migrations = process.argv.slice(2).map(name => {
    if (!filename.test(name)) throw Error('Invalid basename');
    const path = `supabase/migrations/${name}`;
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('Migration must be a regular file');
    return { name, sql: readFileSync(path, 'utf8') };
  });
  let provenance = process.env.LEDGER_PROVENANCE || '';
  if (/^-- applied to production .*?, run /.test(provenance)) {
    if (!/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ATTEMPT || '')) throw Error('Missing Actions attempt identity');
    provenance += ` verification-actions-v1 attempt ${process.env.GITHUB_RUN_ATTEMPT}`;
  }
  const result = await apply({ migrations, reapply: (process.env.REAPPLY_MIGRATIONS || '').split(/\s+/).filter(Boolean), provenance, query: process.env.POSTCONDITION_SQL });
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'succeeded' ? 0 : 1;
}
