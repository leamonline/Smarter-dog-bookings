// Read-only extension of migrations-applied. SQL presence alone cannot attest
// that a release's final postcondition succeeded.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function releaseDigests(rows) {
  if (!Array.isArray(rows)) throw Error('Invalid ledger response');
  const digests = new Set();
  for (const row of rows) {
    if (row.recorded_sql == null && row.provenance == null) continue;
    if (row.local_release == null) continue; // Legacy Actions provenance.
    if (row.local_release.includes(' verification-actions-v1 ')) continue;
    const match = /^-- applied to production from pull request #[1-9][0-9]* head [a-f0-9]{40} by [A-Za-z0-9-]+, local release [a-f0-9-]{36} release-sha256 ([a-f0-9]{64}) \(file [0-9]{14}_[a-z0-9_]+\.sql\)$/.exec(row.local_release);
    if (!match) throw Error('Unreadable local release provenance');
    digests.add(match[1]);
  }
  return [...digests].sort();
}
export function assertSucceeded(digests, attempts) {
  if (!Array.isArray(attempts)) throw Error('Missing release-attempt table or response');
  for (const digest of digests) {
    const rows = attempts.filter(row => row.digest === digest);
    if (rows.length !== 1 || rows[0].outcome !== 'succeeded' || !rows[0].finished_at) throw Error('Local release has not passed its postcondition; reconcile before merge');
  }
}
export async function verifyActionsReleases(rows, env = process.env, request = fetch) {
  if (!Array.isArray(rows)) throw Error('Invalid ledger response');
  const evidence = new Map();
  for (const row of rows) {
    if (row.recorded_sql == null && row.provenance == null) continue;
    if (!row.local_release?.includes(' verification-actions-v1 ')) continue;
    const match = /^-- applied to production from (?:pull request #[1-9][0-9]* head|main) [a-f0-9]{40} by [A-Za-z0-9-]+, run https:\/\/github\.com\/leamonline\/Smarter-dog-bookings\/actions\/runs\/([1-9][0-9]*) verification-actions-v1 attempt ([1-9][0-9]*) \(file [0-9]{14}_[a-z0-9_]+\.sql\)$/.exec(row.local_release);
    if (!match) throw Error('Unreadable Actions verification provenance');
    evidence.set(`${match[1]}/${match[2]}`, {id: Number(match[1]), attempt: Number(match[2])});
  }
  for (const [key, expected] of evidence) {
    if (!env.GH_TOKEN) throw Error('Missing Actions read credential');
    const response = await request(`https://api.github.com/repos/leamonline/Smarter-dog-bookings/actions/runs/${key.replace('/', '/attempts/')}`, {headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if (!response.ok) throw Error('Cannot read Actions release evidence');
    const run = await response.json();
    if (run.id !== expected.id || run.run_attempt !== expected.attempt || run.repository?.full_name !== 'leamonline/Smarter-dog-bookings' || run.path !== '.github/workflows/production-apply-migrations.yml' || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success') throw Error('Actions release has not completed successfully');
  }
}
export async function verifyLocalReleases(rows, env = process.env, request = fetch) {
  await verifyActionsReleases(rows, env, request);
  const digests = releaseDigests(rows);
  if (!digests.length) return;
  // The Management API target is explicit, never inferred from a local link.
  if (env.SUPABASE_PROJECT_REF !== 'nlzhllhkigmsvrzduefz' || !env.SUPABASE_ACCESS_TOKEN) throw Error('Missing verified production target or read credential');
  const query = `select digest,outcome,finished_at from release_control.attempts where digest in (${digests.map(d => `'${d}'`).join(',')})`;
  const response = await request(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, { method:'POST', headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}) });
  if (!response.ok) throw Error('Cannot verify local release attempts');
  const body = await response.json();
  assertSucceeded(digests, Array.isArray(body) ? body : body.result);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await verifyLocalReleases(JSON.parse(readFileSync(0,'utf8'))); console.log('Release postcondition evidence verified (or historical provenance only).'); }
  catch { console.error('Release evidence missing, unknown or unsuccessful; migrations-applied refuses merge.'); process.exitCode=1; }
}
