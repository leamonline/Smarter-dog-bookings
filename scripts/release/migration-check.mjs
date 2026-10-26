// Trusted target workflow publishes its result on the exact PR head, not base.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REPOSITORY } from './manifest.mjs';

export const checkTitle = (pr, head) => `Migration verification: PR #${pr} at ${head}`;
export const checkIdentity = (run, attempt, head) => `migration-check:${run}:${attempt}:${head}`;

export function assertTrustedMigrationRun(run, check, {pr, source, main, runId, attempt, historicalBaseVerified = false}) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || run.id !== runId || run.run_attempt !== attempt ||
      run.repository?.full_name !== REPOSITORY || run.path !== '.github/workflows/check-migrations-applied.yml' ||
      run.event !== 'pull_request_target' || run.head_branch !== 'main' || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '') ||
      (run.head_sha !== main && !historicalBaseVerified) ||
      run.display_title !== checkTitle(pr, source) || run.status !== 'completed' ||
      run.conclusion !== check.conclusion || !['success','failure'].includes(run.conclusion) ||
      check.external_id !== checkIdentity(runId, attempt, source)) throw Error('Untrusted or stale migration verification run');
}

async function api(path, method, body, env, request) {
  if (!env.GH_TOKEN) throw Error('Missing GitHub check credential');
  const response = await request(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
    method, headers:{Authorization:`Bearer ${env.GH_TOKEN}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28'},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.ok) throw Error('Cannot publish migration verification check');
  return response.json();
}

export async function publishMigrationCheck(action, env = process.env, request = fetch) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request, number = event.number;
  const run = Number(env.GITHUB_RUN_ID), attempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_EVENT_NAME !== 'pull_request_target' ||
      pr?.base?.repo?.full_name !== REPOSITORY || pr.base.ref !== 'main' ||
      !Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? '') ||
      !Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(attempt) || attempt < 1) throw Error('Invalid migration check identity');
  const identity = checkIdentity(run, attempt, pr.head.sha);
  if (action === 'start') {
    const check = await api('check-runs', 'POST', {name:'migrations-applied', head_sha:pr.head.sha, status:'in_progress',
      external_id:identity, details_url:`https://github.com/${REPOSITORY}/actions/runs/${run}/attempts/${attempt}`}, env, request);
    if (!Number.isSafeInteger(check.id) || check.id < 1) throw Error('Invalid published check ID');
    return check.id;
  }
  const id = Number(env.CHECK_ID);
  if (action !== 'complete' || !Number.isSafeInteger(id) || id < 1) throw Error('Invalid check update');
  const existing = await api(`check-runs/${id}`, 'GET', null, env, request);
  if (existing.name !== 'migrations-applied' || existing.head_sha !== pr.head.sha || existing.external_id !== identity) throw Error('Check identity changed');
  const conclusion = env.VERIFICATION_STATUS === 'success' ? 'success' : env.VERIFICATION_STATUS === 'cancelled' ? 'cancelled' : 'failure';
  await api(`check-runs/${id}`, 'PATCH', {status:'completed', conclusion}, env, request);
  return id;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(`id=${await publishMigrationCheck(process.argv[2])}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
