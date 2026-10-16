#!/usr/bin/env node
import { lstatSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { apply, filename, sha256 } from './engine.mjs';
import { canonical, makeManifest, readPackage, seal, PRODUCTION } from './manifest.mjs';
import { command, git, githubSnapshot, sources, stagingEvidence, verifyGateException, refresh } from './preflight.mjs';

export function trustedTooling(main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (git('rev-parse', '--show-toplevel') !== root) throw Error('Run from the trusted repository root');
  for (const file of ['engine.mjs', 'manifest.mjs', 'preflight.mjs', 'local-release.mjs', 'credential-helper.swift']) {
    const path = `scripts/release/${file}`;
    if (!lstatSync(join(root, path)).isFile() || lstatSync(join(root, path)).isSymbolicLink() || readFileSync(join(root, path), 'utf8') !== command('git', ['show', `${main}:${path}`])) throw Error('Release tooling is not exact trusted main');
  }
  if (readFileSync(join(root, 'scripts/lex-migration-sql.pl'), 'utf8') !== command('git', ['show', `${main}:scripts/lex-migration-sql.pl`])) throw Error('Lexer differs from trusted main');
}

async function privateCommand(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', cancelled = false;
    const stop = () => { cancelled = true; child.kill('SIGTERM'); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    child.stdout.on('data', data => { output += data; if (output.length > 4 * 1024 * 1024) stop(); });
    child.stderr.resume();
    child.on('error', () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); reject(Error('Operator command unavailable')); });
    child.on('close', code => { process.off('SIGINT', stop); process.off('SIGTERM', stop); if (code === 0 && !cancelled) resolve(output); else reject(Error('Operator command cancelled or failed')); });
  });
}
export async function unlock(digest) {
  if (process.platform !== 'darwin' || process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) throw Error('A human-operated macOS desktop is required; no credential fallback');
  const app = '/Applications/SmarterDogRelease.app';
  // A TTY is merely a usability gate. User presence is enforced by the signed
  // helper's data-protection Keychain access-control object, not the terminal.
  command('/usr/bin/codesign', ['--verify', '--strict', '--deep', '-R', 'identifier "com.smarterdog.release" and anchor apple generic', app]);
  const expected = sha256(readFileSync(new URL('./credential-helper.swift', import.meta.url)));
  const embedded = readFileSync(`${app}/Contents/Resources/credential-helper.swift`, 'utf8');
  if (sha256(embedded) !== expected) throw Error('Installed helper source differs from trusted main; rebuild and sign');
  const token = await privateCommand(`${app}/Contents/MacOS/credential-helper`, ['--read', digest, PRODUCTION]);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw Error('Human unlock failed');
  return token;
}

export function parseCredentials(dump) {
  const result = {};
  for (const line of dump.split('\n')) {
    const m = /^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="([A-Za-z0-9_.-]+)"$/.exec(line);
    if (m) { if (result[m[1]]) throw Error('Duplicate database credential field'); result[m[1]] = m[2]; }
  }
  if (Object.keys(result).length !== 5 || result.PGPORT !== '5432') throw Error('Unsupported CLI credential output');
  return result;
}
export function assertApprovedPackage(path, digest, now) {
  const current = readPackage(path, now);
  if (current.digest !== digest) throw Error('Package changed during approval');
  return current;
}

export async function execute(path) {
  const pkg = readPackage(path), m = pkg.manifest;
  trustedTooling(m.main);
  refresh(m);
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) throw Error('Missing human unlock');
  console.log(`Production ${PRODUCTION}\nRelease SHA-256 ${pkg.digest}\nSource ${m.source}\nReapply: ${m.reapply.join(', ') || 'none'}`);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try { answer = await input.question(`Type "${PRODUCTION} ${pkg.digest}" to approve this exact package: `); } finally { input.close(); }
  if (answer !== `${PRODUCTION} ${pkg.digest}`) throw Error('Approval cancelled');
  const state = join(homedir(), '.local/state/smarter-dog/releases');
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(join(state, `${pkg.digest}.consumed`), `${new Date().toISOString()}\n`, { flag: 'wx', mode: 0o600 });
  const receipt = { version: 1, digest: pkg.digest, releaseId: m.releaseId, source: m.source, main: m.main, target: PRODUCTION, actor: '', startedAt: new Date().toISOString(), status: 'not_started', files: m.migrations.map(({ name, sha256 }) => ({ name, sha256, outcome: 'not_started' })) };
  const previousUmask = process.umask(0o077);
  const dir = mkdtempSync(join(tmpdir(), 'local-release-'));
  let token;
  let interrupted = false;
  const markInterrupted = () => { interrupted = true; };
  process.on('SIGINT', markInterrupted); process.on('SIGTERM', markInterrupted);
  try {
    token = await unlock(pkg.digest);
    if (interrupted) throw Error('Interrupted');
    const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
    delete env.SUPABASE_DB_PASSWORD; delete env.PGPASSWORD;
    mkdirSync(join(dir, 'supabase'), { mode: 0o700 });
    writeFileSync(join(dir, 'supabase/config.toml'), command('git', ['show', `${m.main}:supabase/config.toml`]), { mode: 0o600 });
    await privateCommand('supabase', ['link', '--project-ref', PRODUCTION], { cwd: dir, env });
    if (interrupted) throw Error('Interrupted');
    const assertTarget = () => { if (readFileSync(join(dir, 'supabase/.temp/project-ref'), 'utf8').trim() !== PRODUCTION) throw Error('Linked target mismatch'); };
    assertTarget();
    const creds = parseCredentials(await privateCommand('supabase', ['db', 'dump', '--linked', '--schema', 'public', '--dry-run'], { cwd: dir, env }));
    if (interrupted) throw Error('Interrupted');
    // Unlock/link may take time. Refresh again immediately before database use.
    assertApprovedPackage(path, pkg.digest); refresh(m); trustedTooling(m.main); assertTarget();
    receipt.actor = JSON.parse(command('gh', ['api', 'user'])).login;
    if (!/^[A-Za-z0-9-]+$/.test(receipt.actor)) throw Error('Invalid operator identity');
    const provenance = `-- applied to production from pull request #${m.pr} head ${m.source} by ${receipt.actor}, local release ${m.releaseId}`;
    await new Promise(resolve => setImmediate(resolve)); // Deliver pending cancellation after synchronous GitHub reads.
    if (interrupted) throw Error('Interrupted');
    assertApprovedPackage(path, pkg.digest); // Re-read identity and expiry after all waits.
    receipt.status = 'reconciliation_required';
    const result = await apply({ migrations: m.migrations, reapply: m.reapply, query: m.postcondition.sql, provenance, digest: pkg.digest }, { PATH: process.env.PATH, ...creds, PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system', PGCONNECT_TIMEOUT: '15' });
    Object.assign(receipt, result);
  } catch {
    // Do not include exception text: external commands can echo credentials.
    receipt.status = receipt.status === 'not_started' ? 'refused_before_apply' : 'reconciliation_required';
  } finally {
    process.umask(previousUmask);
    process.off('SIGINT', markInterrupted); process.off('SIGTERM', markInterrupted);
    token = undefined;
    rmSync(dir, { force: true, recursive: true });
    receipt.finishedAt = new Date().toISOString();
    writeFileSync(join(state, `${pkg.digest}.receipt.json`), canonical(receipt) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(`Release ${receipt.status}; receipt ${join(state, `${pkg.digest}.receipt.json`)}`);
  if (receipt.status !== 'succeeded') throw Error('Release did not succeed. Reconcile before preparing a new package; never retry this approval');
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'prepare' && args.length === 6) {
    const [prText, migrationsText, reapplyText, stagingText, recoveryPath, output] = args;
    // Recovery input is data only; shell commands are never evaluated.
    const input = JSON.parse(readFileSync(recoveryPath, 'utf8'));
    if (Object.keys(input).sort().join(',') !== 'postcondition,recovery') throw Error('Expected postcondition and recovery');
    const names = migrationsText.split(','); if (names.some(n => !filename.test(n))) throw Error('Invalid names');
    const snapshot = githubSnapshot(Number(prText));
    const migrations = sources(snapshot.main, snapshot.source, names);
    verifyGateException(snapshot.checks, migrations, reapplyText === '-' ? [] : reapplyText.split(','));
    const staging = stagingEvidence(Number(stagingText), snapshot, migrations);
    const pkg = seal(makeManifest({ ...snapshot, migrations, reapply: reapplyText === '-' ? [] : reapplyText.split(','), staging, postcondition: { sql: input.postcondition, sha256: sha256(input.postcondition) }, recovery: input.recovery }));
    writeFileSync(output, canonical(pkg) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Prepared ${output}; SHA-256 ${pkg.digest}. Review full SQL, staging evidence and recovery before execution.`);
  } else if (mode === 'validate' && args.length === 1) {
    const pkg = readPackage(args[0]); refresh(pkg.manifest); console.log(`Valid current package ${pkg.digest}`);
  } else if (mode === 'execute' && args.length === 1) await execute(args[0]);
  else throw Error('Usage: local-release prepare PR NAMES_COMMA_SEPARATED REAPPLY_OR_DASH STAGING_RUN_ID RECOVERY_JSON OUTPUT | validate PACKAGE | execute PACKAGE');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Release command refused or failed. Check prerequisites and sanitised receipt; no automatic retry.'); process.exitCode = 1; });
