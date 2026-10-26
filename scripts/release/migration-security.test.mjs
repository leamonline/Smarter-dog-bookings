import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {prepareMigrationSource} from './migration-source.mjs';
import {assertTrustedMigrationRun, checkTitle, checkIdentity, publishMigrationCheck} from './migration-check.mjs';
import {assertMainOnlyEnvironment, verifyAutomationEnvironment} from './automation-environment.mjs';

const project = process.cwd(), repo = 'leamonline/Smarter-dog-bookings';
const workflow = readFileSync(join(project,'.github/workflows/check-migrations-applied.yml'),'utf8');
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const parsed = yaml.load(workflow);

test('credential-bearing workflows execute trusted main; staging has a separate credential', () => {
  assert.ok(parsed.on.pull_request_target); assert.equal(parsed.on.pull_request, undefined);
  const job = parsed.jobs['migrations-applied'];
  assert.equal(job.environment,'supabase-automation');
  assert.equal(job.steps.find(s=>s.uses?.startsWith('actions/checkout@')).with.ref,'${{ github.sha }}');
  assert.equal(parsed.permissions.checks,'write');
  assert.match(job.steps.find(s=>s.id==='check').run,/migration-check.mjs start/);
  assert.match(job.steps.at(-1).if,/always\(\)/);
  const verify = job.steps.find(s=>s.name==='Verify migrations against prod');
  assert.match(verify.env.SUPABASE_ACCESS_TOKEN,/head.repo.full_name == github.repository/);
  assert.match(verify.env.SUPABASE_ACCESS_TOKEN,/user.type != 'Bot'/);
  assert.match(verify.run,/node "\$GITHUB_WORKSPACE\/scripts\/release\/merge-gate.mjs"/);
  for (const name of ['check-migrations-applied','deploy-edge-functions','check-migrations-drift','check-advisors-drift']) {
    const source=readFileSync(join(project,`.github/workflows/${name}.yml`),'utf8');
    assert.doesNotMatch(source,/secrets\.SUPABASE_ACCESS_TOKEN\b/);
    const jobs=Object.values(yaml.load(source).jobs);
    assert.ok(jobs.every(j=>j.environment==='supabase-automation' && j.if==="github.ref == 'refs/heads/main'"));
    assert.match(source,/automation-environment.mjs/);
  }
  const staging=readFileSync(join(project,'.github/workflows/staging-apply-migrations.yml'),'utf8');
  assert.match(staging,/secrets\.STAGING_SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(staging,/secrets\.SUPABASE_ACCESS_TOKEN\b/);
});

test('only exact main branch environment policy is accepted, with no tag or wildcard escape', async () => {
  const env={deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
  const policies={total_count:1,branch_policies:[{name:'main',type:'branch'}]};
  assertMainOnlyEnvironment(env,policies);
  for(const p of [{...policies,total_count:2},{...policies,branch_policies:[]},{...policies,branch_policies:[{name:'*',type:'branch'}]},{...policies,branch_policies:[{name:'main',type:'tag'}]}]) assert.throws(()=>assertMainOnlyEnvironment(env,p));
  for(const e of [{},{deployment_branch_policy:null},{deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}}]) assert.throws(()=>assertMainOnlyEnvironment(e,policies));
  const context={GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GH_TOKEN:'synthetic'};
  await verifyAutomationEnvironment(context,async url=>({ok:true,json:async()=>url.includes('branch-policies')?policies:env}));
  await assert.rejects(verifyAutomationEnvironment({...context,GITHUB_REF:'refs/pull/1/merge'},()=>{throw Error('no network');}));
  await assert.rejects(verifyAutomationEnvironment(context,async()=>({ok:false})));
});

test('exact-head check publication binds run attempt and rejects another check on completion', async () => {
  const root=mkdtempSync(join(tmpdir(),'migration-check-test-'));
  const head='a'.repeat(40), event={number:1,pull_request:{head:{sha:head},base:{ref:'main',repo:{full_name:repo}}}};
  const env={GITHUB_EVENT_PATH:join(root,'event.json'),GITHUB_REPOSITORY:repo,GITHUB_EVENT_NAME:'pull_request_target',GITHUB_RUN_ID:'21',GITHUB_RUN_ATTEMPT:'2',GH_TOKEN:'synthetic',CHECK_ID:'7',VERIFICATION_STATUS:'success'};
  try {
    writeFileSync(env.GITHUB_EVENT_PATH,JSON.stringify(event));
    const calls=[];
    const request=async(url,options)=>{
      calls.push({url,options,body:options.body&&JSON.parse(options.body)});
      return {ok:true,json:async()=>options.method==='GET'?{id:7,name:'migrations-applied',head_sha:head,external_id:checkIdentity(21,2,head)}:{id:7}};
    };
    assert.equal(await publishMigrationCheck('start',env,request),7);
    assert.equal(calls[0].body.head_sha,head); assert.equal(calls[0].body.status,'in_progress');
    assert.match(calls[0].body.details_url,/runs\/21\/attempts\/2$/);
    await publishMigrationCheck('complete',env,request);
    assert.equal(calls.at(-1).body.conclusion,'success');
    await assert.rejects(publishMigrationCheck('complete',env,async()=>({ok:true,json:async()=>({name:'migrations-applied',head_sha:'b'.repeat(40),external_id:checkIdentity(21,2,head)})})));
    for(const status of ['failure','cancelled','unknown']) {await publishMigrationCheck('complete',{...env,VERIFICATION_STATUS:status},request);assert.equal(calls.at(-1).body.conclusion,status==='cancelled'?'cancelled':'failure');}
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('release evidence cannot substitute base success, another head, run, attempt or workflow', () => {
  const source='a'.repeat(40), main='b'.repeat(40), context={pr:1,source,main,runId:21,attempt:2};
  const check={conclusion:'success',external_id:checkIdentity(21,2,source)};
  const run={id:21,run_attempt:2,repository:{full_name:repo},path:'.github/workflows/check-migrations-applied.yml',event:'pull_request_target',head_branch:'main',head_sha:main,display_title:checkTitle(1,source),status:'completed',conclusion:'success'};
  assertTrustedMigrationRun(run,check,context);
  const advanced={...context,main:'c'.repeat(40)};
  assert.throws(()=>assertTrustedMigrationRun(run,check,advanced));
  assertTrustedMigrationRun(run,check,{...advanced,historicalBaseVerified:true});
  for(const patch of [{id:22},{run_attempt:1},{event:'pull_request'},{head_sha:source},{head_branch:'feature'},{display_title:checkTitle(1,'c'.repeat(40))},{path:'.github/workflows/ci.yml'},{conclusion:'failure'},{status:'in_progress'},{repository:{full_name:'other/repo'}}]) assert.throws(()=>assertTrustedMigrationRun({...run,...patch},check,context));
  assert.throws(()=>assertTrustedMigrationRun(run,{...check,external_id:'forged'},context));
  assertTrustedMigrationRun({...run,conclusion:'failure'},{...check,conclusion:'failure'},context);
});

test('malicious PR executable/config copies stay inert; real shell gate retains content/history safeguards', () => {
  const root=mkdtempSync(join(tmpdir(),'migration-boundary-test-')), original=process.cwd();
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const first='20261015000000_original.sql', added='20261015000001_added.sql';
  const commit=()=>{git('add','.');git('-c','core.hooksPath=/dev/null','commit','--quiet','-m','synthetic');return git('rev-parse','HEAD');};
  try {
    git('init','--quiet','-b','main');git('config','user.name','Synthetic Test');git('config','user.email','test@example.invalid');
    mkdirSync(join(root,'supabase/migrations'),{recursive:true});mkdirSync(join(root,'scripts/release'),{recursive:true});mkdirSync(join(root,'.github/workflows'),{recursive:true});
    writeFileSync(join(root,'supabase/migrations',first),'select 1;\n');const base=commit();
    const marker=join(root,'executed');
    writeFileSync(join(root,'scripts/release/merge-gate.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},process.env.SUPABASE_ACCESS_TOKEN);`);
    writeFileSync(join(root,'.github/workflows/check-migrations-applied.yml'),'malicious PR workflow must never execute');
    writeFileSync(join(root,'package.json'),JSON.stringify({type:'module',scripts:{preinstall:`touch ${marker}`}}));
    writeFileSync(join(root,'supabase/migrations',added),'select 2;\n');const head=commit();process.chdir(root);
    const prepared=prepareMigrationSource(base,head,root);
    assert.equal(prepared.files,`supabase/migrations/${added}`);assert.equal(prepared.modified,'');assert.equal(prepared.deleted,'');
    assert.equal(readFileSync(join(prepared.directory,'supabase/migrations',added),'utf8'),'select 2;\n');
    assert.equal(existsSync(join(prepared.directory,'scripts')),false);
    const shell=parsed.jobs['migrations-applied'].steps.find(s=>s.name==='Verify migrations against prod').run;
    const bin=join(root,'bin');mkdirSync(bin);
    const ledger=join(root,'ledger.json');
    writeFileSync(join(bin,'curl'),`#!${process.execPath}\nimport {readFileSync} from 'node:fs';process.stdout.write(readFileSync(${JSON.stringify(ledger)},'utf8'));`,{mode:0o700});
    const env={...process.env,PATH:`${bin}:${process.env.PATH}`,GITHUB_WORKSPACE:project,MIGRATION_SOURCE_DIR:prepared.directory,SUPABASE_PROJECT_REF:'nlzhllhkigmsvrzduefz',SUPABASE_ACCESS_TOKEN:'synthetic-only',ADDED_FILES:prepared.files,DELETED_FILES:'',MODIFIED_FILES:'',PR_NUMBER:'1',PR_HEAD_REPO:repo,GITHUB_REPOSITORY:repo,PR_AUTHOR_TYPE:'User',GH_TOKEN:''};
    const row={version:'20261015000001',name:'added',recorded_sql:'select 2;\n',provenance:null,local_release:null};
    const execute=(rows,patch={})=>{writeFileSync(ledger,JSON.stringify(rows));return spawnSync('bash',['-c',shell],{cwd:project,env:{...env,...patch},encoding:'utf8'});};
    const legitimate=execute([row]);assert.equal(legitimate.status,0,legitimate.stdout + legitimate.stderr);
    const pending=execute([]);assert.notEqual(pending.status,0);assert.match(pending.stdout,/✗ PENDING:/);
    assert.match(execute([{...row,recorded_sql:''}]).stdout,/✗ CONTENT MISMATCH:/);
    assert.equal(execute([{...row,recorded_sql:null}]).status,0);
    assert.equal(execute([{...row,recorded_sql:'select 2;   \n'}]).status,0);
    assert.match(execute([row],{ADDED_FILES:'',DELETED_FILES:`supabase/migrations/${added}`}).stdout,/REMOVED BUT APPLIED/);
    assert.match(execute([row],{ADDED_FILES:'',MODIFIED_FILES:`supabase/migrations/${added}`}).stdout,/EDITED BUT APPLIED/);
    assert.match(execute([],{ADDED_FILES:'',MODIFIED_FILES:`supabase/migrations/${added}`}).stdout,/✗ EDITED:/);
    assert.match(execute([{...row,provenance:'-- applied to production from pull request #1 head synthetic (file 20261015000002_gone.sql)'}]).stdout,/APPLIED FROM THIS PULL REQUEST BUT GONE/);
    assert.notEqual(execute([],{SUPABASE_ACCESS_TOKEN:''}).status,0);
    assert.equal(execute([],{SUPABASE_ACCESS_TOKEN:'',ADDED_FILES:'',PR_AUTHOR_TYPE:'Bot'}).status,0);
    assert.equal(execute([],{SUPABASE_ACCESS_TOKEN:'',ADDED_FILES:'',PR_HEAD_REPO:'fork/repo'}).status,0);
    assert.notEqual(execute([],{SUPABASE_ACCESS_TOKEN:'',ADDED_FILES:''}).status,0);
    assert.equal(existsSync(marker),false,'PR helper/workflow/package must not execute with synthetic credential');
    git('reset','--hard',head);rmSync(join(root,'supabase/migrations',added));symlinkSync('/tmp/foreign.sql',join(root,'supabase/migrations',added));const symlink=commit();assert.throws(()=>prepareMigrationSource(base,symlink,root),/symlink/);
    git('reset','--hard',head);writeFileSync(join(root,'supabase/migrations',added),Buffer.from([0xff,0xfe]));const invalid=commit();assert.throws(()=>prepareMigrationSource(base,invalid,root));
    assert.throws(()=>prepareMigrationSource('--help',head,root),/exact/);
  } finally {process.chdir(original);rmSync(root,{recursive:true,force:true});}
});
