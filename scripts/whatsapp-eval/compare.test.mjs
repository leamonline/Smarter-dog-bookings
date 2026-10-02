import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./compare.mjs', import.meta.url));
test('actual source capture uses only synthetic configuration and distinguishes changed factual context', () => {
  const output = mkdtempSync(join(tmpdir(), 'whatsapp-eval-test-'));
  try {
    execFileSync(process.execPath, [script, 'prepare', output], { env: { ...process.env, ANTHROPIC_API_KEY: 'parent-secret-must-not-enter-capture', SUPABASE_URL: 'https://real-target-must-not-enter-capture.invalid' } });
    const base = JSON.parse(readFileSync(join(output, 'base-requests.json')));
    const candidate = JSON.parse(readFileSync(join(output, 'candidate-requests.json')));
    const context = (rows, id) => rows.find((r) => r.id === id).request.messages[0].content;
    assert.equal(base.length, 14);
    assert.equal(candidate.length, 14);
    assert.equal(context(base, 'later-appointment').includes('2026-11-12 at 11:00'), false);
    assert.equal(context(candidate, 'later-appointment').includes('2026-11-12 at 11:00'), true);
    assert.equal(context(candidate, 'open-thursday').includes('Review-only drafting mode'), true);
    assert.equal(context(candidate, 'ambiguous-cancellation').includes('Review-only drafting mode'), false);
    const all = JSON.stringify({ base, candidate });
    assert.equal(all.includes('parent-secret-must-not-enter-capture'), false);
    assert.equal(all.includes('real-target-must-not-enter-capture'), false);
    assert.deepEqual(readdirSync(output).sort(), ['base-requests.json', 'candidate-requests.json', 'manifest.json']);
    // Missing credentials fail before any provider fetch or result creation.
    assert.throws(() => execFileSync(process.execPath, [script, 'execute', output], { env: { ...process.env, ANTHROPIC_API_KEY: '' }, stdio: 'pipe' }), /must already be present/);
    assert.equal(readdirSync(output).length, 3);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
test('provider execution records blinded results and stops without retry after a simulated failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'whatsapp-provider-test-'));
  const environment = { ...process.env, ANTHROPIC_API_KEY: 'synthetic-provider-key' };
  const run = (output, fail) => {
    const mock = `let count = 0; globalThis.fetch = async (url, init) => {
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error('Forbidden destination');
      const request = JSON.parse(init.body); count++;
      if (request.max_tokens !== 512 || request.model !== 'claude-sonnet-4-6') throw new Error('Unexpected model scope');
      if (${fail} && count === 2) return Response.json({error: {type: 'invalid_request_error', message: 'synthetic-provider-key sk-ant-example-private'}}, {status: 400, headers: {'request-id': 'synthetic-request'}});
      return Response.json({ content: [{type: 'text', text: JSON.stringify({intent: 'booking_query', confidence: 0.5, proposed_text: 'Synthetic reply ' + count})}], stop_reason: 'end_turn', usage: {input_tokens: 1, output_tokens: 1} });
    };`;
    return execFileSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`, script, 'execute', output], { env: environment, stdio: 'pipe' });
  };
  try {
    const completed = join(root, 'completed');
    execFileSync(process.execPath, [script, 'prepare', completed]);
    run(completed, false);
    const results = JSON.parse(readFileSync(join(completed, 'results.json')));
    const blind = JSON.parse(readFileSync(join(completed, 'blind-review.json')));
    const key = JSON.parse(readFileSync(join(completed, 'blind-key.json')));
    assert.equal(results.length, 28);
    assert.equal(results.every((r) => r.schemaValid), true);
    assert.equal(blind.length, 28);
    assert.equal(blind.some((r) => 'label' in r), false);
    assert.equal(key.length, 28);
    for (const row of blind) {
      const label = key.find((k) => k.fixture === row.fixture && k.reply === row.reply).label;
      assert.equal(row.text, results.find((r) => r.fixture === row.fixture && r.label === label).text);
    }
    assert.throws(() => run(completed, false), /already contains run evidence/);
    const failed = join(root, 'failed');
    execFileSync(process.execPath, [script, 'prepare', failed]);
    assert.throws(() => run(failed, true), /stopped without retry/);
    assert.equal(JSON.parse(readFileSync(join(failed, 'incomplete.json'))).completed, 1);
    const diagnostic = JSON.parse(readFileSync(join(failed, 'base-explicit-closure.json')));
    assert.equal(diagnostic.status, 400);
    assert.equal(diagnostic.errorType, 'invalid_request_error');
    assert.equal(diagnostic.message, '[redacted] [redacted]');
    assert.equal(diagnostic.requestId, 'synthetic-request');
    assert.deepEqual(readdirSync(failed).sort(), ['base-explicit-closure.json', 'base-open-thursday.json', 'base-requests.json', 'candidate-requests.json', 'incomplete.json', 'manifest.json']);
    assert.throws(() => run(failed, false), /already contains run evidence/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('follow-up preparation pins explicit revisions without altering first-run evidence', () => {
  const output = mkdtempSync(join(tmpdir(), 'whatsapp-follow-up-test-'));
  try {
    execFileSync(process.execPath, [script, 'prepare', output, '48895646', '48895646']);
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json')));
    assert.equal(manifest.base, '48895646d7292d91001d6960ed9f5515eb97d48e');
    assert.equal(manifest.candidate, manifest.base);
    assert.equal(manifest.fixtureVersion, 2);
    assert.equal(manifest.calls, 28);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('recovery reuses twenty responses and makes exactly eight provider calls', () => {
  const output = mkdtempSync(join(tmpdir(), 'whatsapp-recovery-test-'));
  try {
    execFileSync(process.execPath, [script, 'prepare', output]);
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json')));
    const jobs = ['base','candidate'].flatMap(label => JSON.parse(readFileSync(join(output, `${label}-requests.json`))).map(row => ({...row,label})));
    const cache = jobs.slice(0,20).map(j => ({id:`${j.label}-${j.id}`,body:{type:'message',content:[{type:'text',text:JSON.stringify({intent:'faq',confidence:0.9,proposed_text:'Cached synthetic reply'})}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}}));
    const bytes = JSON.stringify(cache);
    writeFileSync(join(output,'cached-responses.json'),bytes);
    manifest.recovery = {cacheHash:createHash('sha256').update(bytes).digest('hex'),remainingCalls:8};
    writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest));
    const mock = `let n=0;globalThis.fetch=async()=>{n++;if(n>8)throw new Error('Duplicate provider call');return Response.json({type:'message',content:[{type:'text',text:JSON.stringify({intent:'faq',confidence:0.9,proposed_text:'New synthetic reply'})}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}})};process.on('exit',()=>{if(n!==8)process.exitCode=1});`;
    execFileSync(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(mock)}`,script,'execute',output],{env:{...process.env,ANTHROPIC_API_KEY:'synthetic'},stdio:'pipe'});
    assert.equal(JSON.parse(readFileSync(join(output,'results.json'))).length,28);
    assert.throws(()=>execFileSync(process.execPath,[script,'execute',output],{env:{...process.env,ANTHROPIC_API_KEY:'synthetic'},stdio:'pipe'}),/already contains run evidence/);
  } finally {rmSync(output,{recursive:true,force:true});}
});
