// GitHub enforces this policy before releasing environment-scoped credentials.
import { fileURLToPath } from 'node:url';
import { REPOSITORY } from './manifest.mjs';

export function assertMainOnlyEnvironment(environment, policies) {
  if (environment?.deployment_branch_policy?.protected_branches !== false ||
      environment.deployment_branch_policy.custom_branch_policies !== true ||
      policies?.total_count !== 1 || policies.branch_policies?.length !== 1 ||
      policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch') throw Error('supabase-automation must allow only the main branch and no tags');
}

export async function verifyAutomationEnvironment(env = process.env, request = fetch) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' || !env.GH_TOKEN) throw Error('Expected trusted main automation context');
  const get = async suffix => {
    const res = await request(`https://api.github.com/repos/${REPOSITORY}/environments/supabase-automation${suffix}`, {headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if (!res.ok) throw Error('Cannot verify supabase-automation protection');
    return res.json();
  };
  assertMainOnlyEnvironment(await get(''), await get('/deployment-branch-policies?per_page=100'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await verifyAutomationEnvironment(); console.log('Verified main-only Supabase automation environment.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
