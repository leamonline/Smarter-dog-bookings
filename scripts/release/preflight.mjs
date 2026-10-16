import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, REPOSITORY, STAGING } from './manifest.mjs';
import { sha256 } from './engine.mjs';

export function command(exe, args, options = {}) {
  return execFileSync(exe, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
const blobText = (revision, path) => new TextDecoder('utf-8', { fatal: true }).decode(command('git', ['show', `${revision}:${path}`], {encoding: 'buffer'}));
export const git = (...args) => command('git', args).trim();
const api = path => JSON.parse(command('gh', ['api', path]));
function pages(path) { return JSON.parse(command('gh', ['api', '--paginate', '--slurp', path])).flat(); }
export function githubSnapshot(pr) {
  if (!Number.isSafeInteger(pr) || pr < 1) throw Error('Invalid PR');
  const repo = `repos/${REPOSITORY}`;
  const pull = api(`${repo}/pulls/${pr}`);
  if (pull.state !== 'open' || pull.draft || pull.user?.type === 'Bot' || pull.base.ref !== 'main' || pull.base.repo.full_name !== REPOSITORY || pull.head.repo?.full_name !== REPOSITORY) throw Error('PR must be open, non-draft and same-repository into main');
  const main = api(`${repo}/git/ref/heads/main`).object.sha;
  const latest = new Map();
  for (const r of pages(`${repo}/pulls/${pr}/reviews?per_page=100`)) {
    if (r.state !== 'PENDING') latest.set(r.user.login, { id: r.id, user: r.user.login, state: r.state, commit: r.commit_id });
  }
  const reviews = [...latest.values()].sort((a, b) => a.user.localeCompare(b.user));
  if (reviews.some(r => r.state === 'CHANGES_REQUESTED')) throw Error('Outstanding changes-requested review');
  // Effective branch rules include rulesets. A missing/unreadable rule set fails
  // closed, rather than letting a package choose its own required check names.
  const rules = api(`${repo}/rules/branches/main`);
  const required = rules.filter(r => r.type === 'required_status_checks').flatMap(r => r.parameters.required_status_checks);
  if (!required.length) throw Error('No readable required checks for main');
  // Database evidence is mandatory for this release contract even though the
  // repository-wide ruleset does not require db-tests for non-database PRs.
  if (!required.some(r => r.context === 'db-tests')) required.push({context: 'db-tests', integration_id: 15368});
  const runs = JSON.parse(command('gh', ['api', '--paginate', '--slurp', `${repo}/commits/${pull.head.sha}/check-runs?per_page=100`])).flatMap(p => p.check_runs);
  const checks = [];
  for (const req of required) {
    const candidates = runs.filter(c => c.name === req.context && c.app.id === (req.integration_id ?? 15368) && c.app.id === 15368).sort((a, b) => b.id - a.id);
    const c = candidates[0];
    if (!c || c.head_sha !== pull.head.sha || c.status !== 'completed' || (c.conclusion !== 'success' && !(c.name === 'migrations-applied' && c.conclusion === 'failure'))) throw Error(`Required check unavailable or red: ${req.context}`);
    const url = new URL(c.details_url);
    const match = new RegExp(`^/${REPOSITORY}/actions/runs/([0-9]+)(?:/|$)`).exec(url.pathname);
    if (url.origin !== 'https://github.com' || !match) throw Error('Required check has no verifiable Actions run identity');
    const runId = Number(match[1]);
    const run = api(`${repo}/actions/runs/${runId}`);
    if (run.head_sha !== pull.head.sha || run.repository.full_name !== REPOSITORY || run.status !== 'completed') throw Error('Stale check run');
    checks.push({ name: c.name, id: c.id, runId, head: c.head_sha, conclusion: c.conclusion, appId: c.app.id });
  }
  checks.sort((a, b) => a.name.localeCompare(b.name));
  return { pr, source: pull.head.sha, main, reviews, checks };
}

export function sources(main, source, names) {
  for (const sha of [main, source]) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid source SHA');
    command('git', ['fetch', '--no-tags', 'origin', sha]);
  }
  const tree = sha => git('ls-tree', '-r', sha, '--', 'supabase/migrations/').split('\n').filter(Boolean).map(line => {
    const m = /^(100644|100755) blob ([a-f0-9]{40})\t(supabase\/migrations\/[^\n]+)$/.exec(line);
    if (!m) throw Error('Migration tree contains a symlink or unsupported entry');
    return { path: m[3], blob: m[2] };
  });
  const base = tree(main), head = tree(source);
  for (const entry of base) if (!head.some(h => h.path === entry.path && h.blob === entry.blob)) throw Error('Migration history changed or head is behind main; merged-tree validation refused');
  const dir = mkdtempSync(join(tmpdir(), 'release-preflight-'));
  try {
    mkdirSync(join(dir, 'supabase/migrations'), { recursive: true });
    mkdirSync(join(dir, 'scripts'));
    for (const entry of head) writeFileSync(join(dir, entry.path), blobText(source, entry.path), { mode: 0o600 });
    for (const name of ['check-migrations.mjs', 'migration-name.mjs']) writeFileSync(join(dir, 'scripts', name), command('git', ['show', `${main}:scripts/${name}`]));
    // Validator runs trusted-main source, never scripts from the pull request.
    command(process.execPath, ['scripts/check-migrations.mjs'], { cwd: dir });
    return names.map(name => {
      if (!head.some(h => h.path === `supabase/migrations/${name}`)) throw Error('Requested file absent from exact source');
      const sql = blobText(source, `supabase/migrations/${name}`);
      return { name, sql, sha256: sha256(sql) };
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function stagingEvidence(runId, snapshot, migrations) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw Error('Invalid staging run');
  const run = api(`repos/${REPOSITORY}/actions/runs/${runId}`);
  if (run.head_sha !== snapshot.source || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/staging-apply-migrations.yml' || run.repository.full_name !== REPOSITORY) throw Error('Staging run must succeed for exact source and trusted staging workflow');
  // A PR may not forge evidence by changing the workflow or its apply engine.
  for (const path of ['.github/workflows/staging-apply-migrations.yml', 'scripts/apply-hosted-migrations.sh', 'scripts/lex-migration-sql.pl', 'scripts/release/engine.mjs']) {
    if (command('git', ['show', `${snapshot.main}:${path}`]) !== command('git', ['show', `${snapshot.source}:${path}`])) throw Error('Staging evidence tooling differs from trusted main');
  }
  const log = command('gh', ['run', 'view', String(runId), '--repo', REPOSITORY, '--log']);
  const receipts = log.split('\n').flatMap(line => { const start = line.indexOf('{"status":'); if (start < 0) return []; try { return [JSON.parse(line.slice(start))]; } catch { return []; } });
  const files = migrations.map(({ name, sha256 }) => ({ name, sha256 }));
  if (!receipts.some(r => r.status === 'succeeded' && files.every(f => r.files?.some(m => m.name === f.name && m.sha256 === f.sha256 && ['applied', 'skipped'].includes(m.outcome))))) throw Error('Staging receipt lacks identical applied SQL hashes');
  // Require positive database-test evidence, not a user-supplied attestation.
  const tests = snapshot.checks.filter(c => /pgtap|database|db[- ]test/i.test(c.name) && c.conclusion === 'success').map(c => c.name);
  if (!tests.length) throw Error('No required successful database-test evidence; add a governed check before acceptance');
  return { project: STAGING, runId, url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`, source: snapshot.source, files, tests };
}
export function assertSnapshot(manifest, current) {
  for (const key of ['source', 'main', 'reviews', 'checks']) if (canonical(current[key]) !== canonical(manifest[key])) throw Error(`Approval invalidated: ${key} changed`);
}
export function verifyGateException(checks, migrations, reapply) {
  const failed = checks.find(c => c.name === 'migrations-applied' && c.conclusion === 'failure');
  if (!failed) return;
  const log = command('gh', ['run', 'view', String(failed.runId), '--repo', REPOSITORY, '--log']);
  const failures = [...log.matchAll(/\d{4}-\d{2}-\d{2}T[^\s]+\s+✗ ([^\n]+)/g)].map(m => m[1]);
  if (!failures.length || failures.some(line => {
    const m = /^(PENDING|CONTENT MISMATCH): ([0-9]{14}_[a-z0-9_]+)$/.exec(line);
    return !m || !migrations.some(f => f.name === m[2] + '.sql') || (m[1] === 'CONTENT MISMATCH' && !reapply.includes(m[2] + '.sql'));
  })) throw Error('Migration gate failure is not the approved pending/reapply exception');
}
export function refresh(manifest) {
  const current = githubSnapshot(manifest.pr);
  assertSnapshot(manifest, current);
  verifyGateException(current.checks, manifest.migrations, manifest.reapply);
  if (canonical(sources(current.main, current.source, manifest.migrations.map(m => m.name))) !== canonical(manifest.migrations)) throw Error('SQL source changed');
  if (canonical(stagingEvidence(manifest.staging.runId, current, manifest.migrations)) !== canonical(manifest.staging)) throw Error('Staging evidence changed');
  return current;
}
