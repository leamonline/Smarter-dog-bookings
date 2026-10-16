import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, makeManifest, seal, validate, readPackage, STAGING } from './manifest.mjs';
import { sha256, compile } from './engine.mjs';
import { unlock, parseCredentials, assertApprovedPackage } from './local-release.mjs';
import { assertSnapshot, githubSnapshot, verifyGateException } from './preflight.mjs';
import { releaseDigests, assertSucceeded, verifyLocalReleases } from './merge-gate.mjs';

const source = 'a'.repeat(40);
function fixture() {
  const sql = 'select 1;\n';
  const migrations = [{ name: '20261015000000_test.sql', sql, sha256: sha256(sql) }];
  return makeManifest({ pr: 1, main: 'b'.repeat(40), source, migrations, reapply: [], postcondition: { sql: 'select true', sha256: sha256('select true') }, staging: { project: STAGING, source, runId: 1, url: 'https://github.com/leamonline/Smarter-dog-bookings/actions/runs/1', files: migrations.map(({name, sha256}) => ({name, sha256})), tests: ['db-tests'] }, checks: [{name: 'db-tests', id: 1, runId: 1, appId: 1, head: source, conclusion:'success'}], reviews: [], recovery: { locks: 'Access exclusive on synthetic table', compatibility: 'Additive', partialApply: 'Reconcile every ledger row', rollback: 'Forward correction' } });
}
test('strict canonical full SQL package round-trip and tamper rejection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
  try {
    const path = join(dir, 'package.json'), pkg = seal(fixture());
    writeFileSync(path, canonical(pkg) + '\n'); assert.deepEqual(readPackage(path), pkg);
    const mutations = [
      s => s.replace('"version":1', '"version":1,"version":1'),
      s => s.replace('"version":1', '"unknown":1,"version":1'),
      s => s.replace('select 1;', 'select 2;'),
      s => s.replace('select true', 'select false'),
      s => s.replace('"reapply":[]', '"reapply":["20261015000000_test.sql"]'),
    ];
    for (const mutate of mutations) { writeFileSync(path, mutate(canonical(pkg)) + '\n'); assert.throws(() => readPackage(path)); }
    writeFileSync(path, canonical(pkg) + '\n');
    symlinkSync(path, join(dir,'link')); assert.throws(() => readPackage(join(dir,'link')));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('final execution boundary rereads package identity and expiry after approval waits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'approval-test-'));
  try {
    const path = join(dir, 'package.json'), pkg = seal(fixture());
    writeFileSync(path, canonical(pkg) + '\n');
    assertApprovedPackage(path, pkg.digest, Date.parse(pkg.manifest.expiresAt) - 1);
    assert.throws(() => assertApprovedPackage(path, pkg.digest, Date.parse(pkg.manifest.expiresAt)));
    const replacement = seal(fixture());
    writeFileSync(path, canonical(replacement) + '\n');
    assert.throws(() => assertApprovedPackage(path, pkg.digest));
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('reject wrong target, expiry, stale/red/missing checks, changed evidence and reapply', () => {
  for (const mutate of [m => m.project = STAGING, m => m.createdAt = '2000-01-01T00:00:00.000Z', m => m.checks = [], m => m.checks[0].conclusion = 'failure', m => m.checks[0].head = 'f'.repeat(40), m => m.reviews = [{id:1,user:'reviewer',state:'CHANGES_REQUESTED',commit:source}], m => m.staging.files[0].sha256 = '0'.repeat(64), m => m.reapply = ['not-listed.sql'], m => m.migrations.push(m.migrations[0])]) {
    const m = fixture(); mutate(m); assert.throws(() => validate(m));
  }
  const m=fixture(); assert.throws(() => validate(m, Date.parse(m.expiresAt)));
});
test('SQL compiler refuses unsafe transactions, postconditions and duplicate requests before connection', () => {
  for (const sql of ['begin; select 1; commit; select 2;', '\\! touch /tmp/no', '-- only comments\n', 'select :unsafe;', 'rollback;']) assert.throws(() => compile({migrations:[{name:'20261015000000_test.sql',sql}]}));
  assert.throws(() => compile({migrations:fixture().migrations, query:'select true; select false'}));
  assert.throws(() => compile({migrations:fixture().migrations,reapply:['other.sql']}));
});
test('no unattended credential fallback and no shell evaluation of CLI exports', async () => {
  await assert.rejects(unlock('a'.repeat(64)));
  assert.throws(() => parseCredentials('export PGPASSWORD="$(touch /tmp/no)"'));
  assert.deepEqual(parseCredentials('export PGHOST="db.example.com"\nexport PGPORT="5432"\nexport PGUSER="postgres"\nexport PGPASSWORD="fake-token"\nexport PGDATABASE="postgres"'), {PGHOST:'db.example.com',PGPORT:'5432',PGUSER:'postgres',PGPASSWORD:'fake-token',PGDATABASE:'postgres'});
  const swift = readFileSync(new URL('./credential-helper.swift', import.meta.url),'utf8');
  for (const required of ['.userPresence', 'kSecUseDataProtectionKeychain', 'touchIDAuthenticationAllowableReuseDuration = 0', 'context.invalidate()', 'NSSecureTextField']) assert.ok(swift.includes(required));
});

test('refresh invalidates changed head, main, review identity and check-run identity', () => {
  const manifest = fixture();
  assertSnapshot(manifest, manifest);
  for (const mutate of [m => m.source = 'f'.repeat(40), m => m.main = 'f'.repeat(40), m => m.checks[0].id++, m => m.reviews.push({id:1,user:'reviewer',state:'APPROVED',commit:source})]) {
    const current = structuredClone(manifest); mutate(current);
    assert.throws(() => assertSnapshot(manifest,current));
  }
});

test('real gh adapter rejects unavailable, stale, red, foreign and changed-review evidence without networking', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-gh-test-'));
  const oldPath = process.env.PATH;
  const repo = 'leamonline/Smarter-dog-bookings';
  const prefix = `repos/${repo}`;
  const run = {head_sha:source,repository:{full_name:repo},status:'completed'};
  const check = {name:'build', id:11, head_sha:source, status:'completed',conclusion:'success',app:{id:15368},details_url:`https://github.com/${repo}/actions/runs/21/job/31`};
  const initial = {
    [`${prefix}/pulls/1`]: {state:'open',draft:false,base:{ref:'main',repo:{full_name:repo}},head:{sha:source,repo:{full_name:repo}}},
    [`${prefix}/git/ref/heads/main`]:{object:{sha:'b'.repeat(40)}},
    [`${prefix}/pulls/1/reviews?per_page=100`]:[[]],
    [`${prefix}/rules/branches/main`]:[{type:'required_status_checks',parameters:{required_status_checks:[{context:'build',integration_id:15368}]}}],
    [`${prefix}/commits/${source}/check-runs?per_page=100`]:[{check_runs:[check,{...check,name:'db-tests',id:12}]}],
    [`${prefix}/actions/runs/21`]:run,
    log:'job\tstep\t2026-10-15T10:00:00Z ✗ PENDING: 20261015000000_test\n',
  };
  try {
    writeFileSync(join(dir,'gh'), `#!${process.execPath}\nconst fs=require('fs'); const data=JSON.parse(fs.readFileSync(${JSON.stringify(join(dir,'fixture.json'))},'utf8')); const args=process.argv.slice(2); const key=args[0]==='run'?'log':args.at(-1); if(!(key in data))process.exit(2); process.stdout.write(typeof data[key]==='string'?data[key]:JSON.stringify(data[key]));\n`,{mode:0o700});
    process.env.PATH=`${dir}:${oldPath}`;
    const save = value => writeFileSync(join(dir,'fixture.json'), JSON.stringify(value));
    save(initial); assert.equal(githubSnapshot(1).checks.length,2);
    const mutations = [
      f => f[`${prefix}/pulls/1`].draft=true,
      f => f[`${prefix}/pulls/1`].state='closed',
      f => f[`${prefix}/pulls/1`].user={type:'Bot'},
      f => f[`${prefix}/pulls/1`].head.repo.full_name='foreign/repo',
      f => f[`${prefix}/rules/branches/main`]=[],
      f => f[`${prefix}/pulls/1/reviews?per_page=100`]=[[{id:1,user:{login:'reviewer'},state:'CHANGES_REQUESTED',commit_id:source}]],
      f => f[`${prefix}/commits/${source}/check-runs?per_page=100`][0].check_runs.shift(),
      f => f[`${prefix}/commits/${source}/check-runs?per_page=100`][0].check_runs[0].head_sha='f'.repeat(40),
      f => f[`${prefix}/commits/${source}/check-runs?per_page=100`][0].check_runs[0].conclusion='failure',
      f => f[`${prefix}/commits/${source}/check-runs?per_page=100`][0].check_runs[0].status='queued',
      f => f[`${prefix}/commits/${source}/check-runs?per_page=100`][0].check_runs[0].app.id=99,
      f => f[`${prefix}/actions/runs/21`].head_sha='f'.repeat(40),
    ];
    for(const mutate of mutations) {const f=structuredClone(initial);mutate(f);save(f);assert.throws(()=>githubSnapshot(1));}
    save(initial);
    const failed=[{name:'migrations-applied',conclusion:'failure',runId:21}];
    verifyGateException(failed,fixture().migrations,[]);
    for(const line of ['CONTENT MISMATCH: 20261015000000_test','REMOVED BUT APPLIED: 20261015000000_test','PENDING: 20261015000001_other']) {
      save({...initial,log:`job\tstep\t2026-10-15T10:00:00Z ✗ ${line}\n`});
      assert.throws(()=>verifyGateException(failed,fixture().migrations,[]));
    }
  } finally {process.env.PATH=oldPath;rmSync(dir,{recursive:true,force:true});}
});

test('merge gate requires successful final postcondition evidence and preserves legacy workflow compatibility', async () => {
  const digest='a'.repeat(64);
  const row={recorded_sql:'select 1;',provenance:'present',local_release:`-- applied to production from pull request #1 head ${source} by operator, local release 00000000-0000-4000-8000-000000000000 release-sha256 ${digest} (file 20261015000000_test.sql)`};
  assert.deepEqual(releaseDigests([row]),[digest]);
  assert.deepEqual(releaseDigests([{...row,local_release:null}]),[]);
  assert.throws(()=>releaseDigests([{...row,local_release:'malformed'}]));
  for(const attempts of [undefined,[],[{digest:'b'.repeat(64),outcome:'succeeded',finished_at:'now'}],[{digest,outcome:'unknown'}],[{digest,outcome:'failed'}],[{digest,outcome:'succeeded'}]]) assert.throws(()=>assertSucceeded([digest],attempts));
  assertSucceeded([digest],[{digest,outcome:'succeeded',finished_at:'now'}]);
  const env={SUPABASE_PROJECT_REF:'nlzhllhkigmsvrzduefz',SUPABASE_ACCESS_TOKEN:'synthetic-token'};
  await assert.rejects(verifyLocalReleases([row],{...env,SUPABASE_PROJECT_REF:STAGING},()=>{throw Error('must not call');}));
  await assert.rejects(verifyLocalReleases([row],env,async()=>({ok:false})));
  await assert.rejects(verifyLocalReleases([row],env,async()=>({ok:true,json:async()=>({message:'relation does not exist'})})));
  await verifyLocalReleases([{...row,local_release:null}],{},()=>{throw Error('legacy rows must not require new table');});
  await verifyLocalReleases([row],env,async(url,options)=>{
    assert.equal(url,'https://api.supabase.com/v1/projects/nlzhllhkigmsvrzduefz/database/query');
    assert.match(JSON.parse(options.body).query,/^select digest,outcome,finished_at from release_control.attempts where digest in/);
    return {ok:true,json:async()=>[{digest,outcome:'succeeded',finished_at:'now'}]};
  });
});
