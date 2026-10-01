/** Prepare is offline. Execute requires an explicitly approved provider run. Never loads .env files. */
import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const [command, target, ...extra] = process.argv.slice(2);
if (!['prepare', 'execute'].includes(command) || !target || extra.length) {
  throw new Error('Usage: node scripts/whatsapp-eval/compare.mjs prepare|execute /absolute/output-directory');
}
const output = resolve(target);
if (output === repo || output.startsWith(repo + '/')) throw new Error('Generated evaluation evidence must stay outside the repository.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const save = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const load = (name) => JSON.parse(readFileSync(join(output, name), 'utf8'));
if (command === 'prepare') {
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (readdirSync(output).length) throw new Error('Preparation requires an empty directory; existing evaluation evidence is preserved.');
  const fixturesPath = join(here, 'fixtures.json');
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const base = 'c699e904506450ad346be50207866edc78f74d74';
  const candidate = '48895646d7292d91001d6960ed9f5515eb97d48e';
  const temporary = mkdtempSync(join(tmpdir(), 'whatsapp-eval-'));
  try {
    for (const [label, revision] of [['base', base], ['candidate', candidate]]) {
      const root = join(temporary, label);
      mkdirSync(root);
      const archive = execFileSync('git', ['archive', revision, 'supabase/functions'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 });
      execFileSync('tar', ['-x', '-C', root], { input: archive });
      const capture = join(output, `${label}-requests.json`);
      // Isolated environment; no inherited key or actual Supabase configuration.
      execFileSync('deno', ['run', '--no-config', '--no-lock', '--node-modules-dir=none', '--allow-env', `--allow-read=${root},${fixturesPath}`, `--allow-write=${output}`, join(here, 'capture.ts'), root, fixturesPath, capture, label], {
        cwd: temporary, env: { PATH: process.env.PATH, HOME: process.env.HOME, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
    }
    const requests = ['base', 'candidate'].flatMap((label) => load(`${label}-requests.json`).map((row) => ({ label, ...row })));
    if (requests.length !== fixtures.cases.length * 2 || requests.some((row) => row.request.model !== 'claude-sonnet-4-6' || row.request.max_tokens !== 512)) throw new Error('Unexpected capture count or model settings');
    const inspection = requests.filter((r) => r.label === 'candidate');
    const context = (id) => inspection.find((r) => r.id === id).request.messages[0].content;
    if (!context('open-thursday').includes('2026-10-08: open') || !context('explicit-closure').includes('2026-10-27: closed') || !context('later-appointment').includes('2026-11-12 at 11:00') || !context('london-midnight').includes('tomorrow: 2026-10-03') || !context('lookup-failure').includes('lookup unavailable') || context('cancelled-appointment').includes('2026-10-06 at 09:00')) throw new Error('Candidate fixture grounding failed');
    save('manifest.json', { version: 1, preparedAt: new Date().toISOString(), base, candidate, fixtureVersion: fixtures.version, fixtureHash: hash(readFileSync(fixturesPath)), fixtures, model: 'claude-sonnet-4-6', maxOutputTokens: 512, calls: requests.length, maxOutputTokensTotal: requests.length * 512, requestHashes: Object.fromEntries(['base', 'candidate'].map((label) => [label, hash(readFileSync(join(output, `${label}-requests.json`)))])), routeNote: 'Base uses existing staff-forced route. Candidate new-booking fixtures use automatic review-only; other fixtures use staff-forced. This compares the complete prompt/context treatment, not system text alone.' });
    console.log(`Prepared ${requests.length} requests in ${output}. No provider calls made. Maximum output: ${requests.length * 512} tokens. Input token usage and cost require provider accounting.`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
} else {
  const manifest = load('manifest.json');
  if (readdirSync(output).some((name) => !['manifest.json', 'base-requests.json', 'candidate-requests.json'].includes(name))) throw new Error('This directory already contains run evidence. Refusing to repeat potentially charged requests.');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Approved ANTHROPIC_API_KEY must already be present in the process environment; no secret files are read.');
  const jobs = ['base', 'candidate'].flatMap((label) => {
    const bytes = readFileSync(join(output, `${label}-requests.json`));
    if (hash(bytes) !== manifest.requestHashes[label]) throw new Error('Prepared request integrity check failed');
    return JSON.parse(bytes).map((row) => ({ label, ...row }));
  });
  if (jobs.length !== 28 || manifest.calls !== jobs.length || jobs.some((j) => j.request.model !== manifest.model || j.request.max_tokens !== 512)) throw new Error('Run scope differs from approved 28-request contract');
  // Serial, bounded requests; no automatic retries after uncertain failures.
  const results = [];
  for (const job of jobs) {
    const id = `${job.label}-${job.id}`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(job.request), signal: AbortSignal.timeout(60000) });
      const body = await response.json();
      if (!response.ok) { save(`${id}.json`, { status: response.status, outcome: 'provider-error' }); throw new Error(`Provider refused request (${response.status}); stopped without retry`); }
      save(`${id}.json`, body);
      const text = body.content?.find((block) => block.type === 'text')?.text ?? '';
      let parsed;
      try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')); } catch { /* a schema failure is evidence, not a retry */ }
      const schemaValid = ['faq', 'greeting', 'booking_query', 'booking_propose', 'booking_confirm', 'booking_change', 'booking_cancel', 'confirm_time', 'smalltalk', 'escalate', 'other'].includes(parsed?.intent) && typeof parsed?.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1 && typeof parsed?.proposed_text === 'string';
      results.push({ label: job.label, fixture: job.id, route: job.route, text, schemaValid, forbiddenReviewAction: job.route === 'automatic-review-only' && !!parsed?.booking_action, stopReason: body.stop_reason, usage: body.usage });
      console.log(`Recorded ${results.length}/${jobs.length}: ${job.id}`);
    } catch (error) {
      save('incomplete.json', { completed: results.length, failedCase: id, reason: 'Stopped without automatic retry; inspect evidence before a separately approved retry' });
      throw error;
    }
  }
  const blind = [];
  for (const fixture of manifest.fixtures.cases) {
    const pair = results.filter((row) => row.fixture === fixture.id);
    if (randomInt(2)) pair.reverse();
    pair.forEach((row, i) => blind.push({ fixture: fixture.id, reply: i ? 'B' : 'A', text: row.text, criteria: fixture.criteria, label: row.label }));
  }
  save('results.json', results);
  save('blind-review.json', blind.map(({ label, ...row }) => row));
  save('blind-key.json', blind.map((row) => ({ fixture: row.fixture, reply: row.reply, label: row.label, identical: results.filter((result) => result.fixture === row.fixture).every((result) => result.text === row.text) })));
  console.log(`Recorded complete comparison. Review blind-review.json before results.json/key. Automatic checks are preliminary; promotion requires manual factual, repeated-question, tone and action review. See ${output}`);
}
