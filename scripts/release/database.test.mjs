// Disposable local PostgreSQL only. No inherited PG* or Supabase credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, LOCK_KEY } from './engine.mjs';
import { verifyLocalReleases } from './merge-gate.mjs';

test('real PostgreSQL: atomic files, exact ledger, replay, partial apply, lock contention and lost lock-holder', {timeout:120000}, async () => {
  const root = mkdtempSync('/tmp/release-pg-');
  const bin = process.env.RELEASE_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
  const env = {LC_ALL:'C', PATH:`${bin}:${process.env.PATH}`, PGHOST:root, PGPORT:'55439', PGUSER:'postgres', PGDATABASE:'postgres', PGAPPNAME:'release-engine-test', HOME:root};
  const run = (exe,args,options={}) => execFileSync(join(bin,exe),args,{env,encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
  const query = sql => run('psql',['-X','-Atq','-v','ON_ERROR_STOP=1','-c',sql]).trim();
  const migration = (n,sql) => ({name:`2026101500000${n}_test_${n}.sql`,sql});
  let started=false;
  try {
    run('initdb',['-D',join(root,'data'),'-U','postgres','-A','trust','--no-locale']);
    run('pg_ctl',['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-k ${root} -p 55439 -c listen_addresses=''`,'-w','start']); started=true;
    query('create role anon; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
    query(readFileSync(new URL('./proposed-bootstrap.sql',import.meta.url),'utf8'));
    assert.throws(()=>query('set role anon; select * from release_control.attempts'));
    assert.throws(()=>query("set role anon; insert into release_control.attempts(digest) values(repeat('0',64))"));
    const one=migration(1,'begin;\ncreate table public.release_test_one(id int);\ncommit;\n');
    let r=await apply({migrations:[one],query:'select true',digest:'1'.repeat(64)},env);
    assert.equal(r.status,'succeeded'); assert.equal(r.files[0].outcome,'applied');
    assert.equal(query("select statements[array_upper(statements,1)] = E'begin;\\ncreate table public.release_test_one(id int);\\ncommit;\\n' from supabase_migrations.schema_migrations"),'t');
    assert.equal(query("select outcome from release_control.attempts where digest=repeat('1',64)"),'succeeded');
    r=await apply({migrations:[one],digest:'1'.repeat(64),reapply:[one.name]},env); assert.notEqual(r.status,'succeeded');
    r=await apply({migrations:[one],query:'select true'},env); assert.equal(r.files[0].outcome,'skipped');
    r=await apply({migrations:[{...one,sql:'select 999;'}]},env); assert.notEqual(r.status,'succeeded');
    assert.equal(query("select count(*) from supabase_migrations.schema_migrations"),'1');
    const two=migration(2,'create table public.release_test_two(id int);');
    const three=migration(3,'create table public.release_rolled_back(id int); select 1/0;');
    r=await apply({migrations:[two,three],digest:'2'.repeat(64)},env);
    assert.equal(r.files[0].outcome,'applied'); assert.notEqual(r.status,'succeeded');
    assert.equal(r.files[1].outcome,'failed');
    assert.equal(query("select to_regclass('public.release_rolled_back') is null"),'t');
    assert.equal(query("select count(*) from supabase_migrations.schema_migrations where name='test_3'"),'0');
    assert.equal(query("select outcome from release_control.attempts where digest=repeat('2',64)"),'unknown');
    const four=migration(4,'create table public.release_test_four(id int);');
    r=await apply({migrations:[four],query:'select false',digest:'3'.repeat(64)},env); assert.notEqual(r.status,'succeeded'); assert.equal(r.files[0].outcome,'applied');
    assert.equal(query("select to_regclass('public.release_test_four') is not null"),'t');
    // Newly executed Actions releases commit SQL before final verification too.
    // Exercise the actual merge-gate verifier with rows read from this real ledger.
    for (const [suffix, postcondition, conclusion] of [[10,'select false','failure'],[11,'select pg_terminate_backend(pg_backend_pid())',null],[12,'select true','success']]) {
      const actionsFile={name:`202610160000${suffix}_actions_${suffix}.sql`,sql:`create table public.actions_${suffix}(id int);`};
      const actionsProvenance=`-- applied to production from pull request #1016 head ${'a'.repeat(40)} by operator, run https://github.com/leamonline/Smarter-dog-bookings/actions/runs/${suffix} verification-actions-v1 attempt 1`;
      mkdirSync(join(root,'supabase/migrations'),{recursive:true});
      writeFileSync(join(root,'supabase/migrations',actionsFile.name),actionsFile.sql);
      if (suffix === 10) {
        assert.throws(() => execFileSync(process.execPath,[new URL('./engine.mjs',import.meta.url).pathname,actionsFile.name],{cwd:root,env:{...env,LEDGER_PROVENANCE:actionsProvenance.replace(' verification-actions-v1 attempt 1',''),POSTCONDITION_SQL:postcondition},stdio:['ignore','pipe','pipe']}), error => /Missing Actions attempt identity/.test(error.stderr.toString()));
        assert.equal(query(`select to_regclass('public.actions_${suffix}') is null`),'t');
      }
      let output;
      try { output=execFileSync(process.execPath,[new URL('./engine.mjs',import.meta.url).pathname,actionsFile.name],{cwd:root,env:{...env,LEDGER_PROVENANCE:actionsProvenance.replace(' verification-actions-v1 attempt 1',''),GITHUB_RUN_ATTEMPT:'1',POSTCONDITION_SQL:postcondition},encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
      catch(error) { assert.equal(error.status,1); output=error.stdout; }
      const applied=JSON.parse(output);
      assert.match(query(`select statements[1] from supabase_migrations.schema_migrations where version='202610160000${suffix}'`), /verification-actions-v1 attempt 1/);
      assert.equal(query(`select to_regclass('public.actions_${suffix}') is not null`),'t','SQL committed despite later verification outcome');
      const ledger=JSON.parse(query(`select json_agg(r) from (select statements[array_upper(statements,1)] as recorded_sql, statements[1] as provenance, (select s from unnest(coalesce(statements, '{}')) with ordinality as entry(s, position) where s like '-- applied to production % local release %' or s like '-- applied to production % verification-actions-v1 %' order by position desc limit 1) as local_release from supabase_migrations.schema_migrations where version='202610160000${suffix}') r`));
      const request=async()=>({ok:true,json:async()=>({id:suffix,run_attempt:1,repository:{full_name:'leamonline/Smarter-dog-bookings'},path:'.github/workflows/production-apply-migrations.yml',event:'workflow_dispatch',status:conclusion?'completed':'in_progress',conclusion})});
      assert.equal(applied.status==='succeeded', conclusion==='success');
      if(conclusion==='success') await verifyLocalReleases(ledger,{GH_TOKEN:'synthetic'},request);
      else await assert.rejects(verifyLocalReleases(ledger,{GH_TOKEN:'synthetic'},request));
    }
    const slow=migration(5,'select pg_sleep(20); create table public.release_never(id int);');
    const later=migration(6,'create table public.release_later_never(id int);');
    const holder=apply({migrations:[slow,later],digest:'4'.repeat(64)},env);
    let pid='';
    for(let i=0;i<100;i++) { pid=query("select pid from pg_stat_activity where application_name='release-engine-test' and query like 'select pg_sleep(20)%'"); if(pid)break; await new Promise(r=>setTimeout(r,30)); }
    assert.ok(/^\d+$/.test(pid),'holder reached slow SQL while retaining lock');
    const contender=await apply({migrations:[migration(7,'create table public.release_contender(id int);')]},env);
    assert.notEqual(contender.status,'succeeded'); assert.equal(query("select to_regclass('public.release_contender') is null"),'t');
    query(`select pg_terminate_backend(${pid})`);
    r=await holder; assert.notEqual(r.status,'succeeded');
    assert.equal(query("select to_regclass('public.release_never') is null and to_regclass('public.release_later_never') is null"),'t');
    assert.equal(query(`select pg_try_advisory_lock(${LOCK_KEY}::bigint)`),'t');
    r=await apply({migrations:[slow],digest:'4'.repeat(64)},env); assert.notEqual(r.status,'succeeded');
    // SIGTERM to the client must cancel its sole session and produce a receipt;
    // no later transaction may survive on a different connection.
    const interruptedOptions={migrations:[slow,later],digest:'7'.repeat(64)};
    writeFileSync(join(root,'interrupt.mjs'),`import {apply} from ${JSON.stringify(new URL('./engine.mjs',import.meta.url).href)}; console.log(JSON.stringify(await apply(${JSON.stringify(interruptedOptions)})));`);
    const interrupted=spawn(process.execPath,[join(root,'interrupt.mjs')],{env,stdio:['ignore','pipe','pipe']});
    let interruptionOutput='';interrupted.stdout.on('data',d=>interruptionOutput+=d);interrupted.stderr.resume();
    const closed=new Promise(resolve=>interrupted.on('close',resolve));
    pid='';
    for(let i=0;i<100;i++) {pid=query("select pid from pg_stat_activity where application_name='release-engine-test' and query like 'select pg_sleep(20)%'");if(pid)break;await new Promise(r=>setTimeout(r,30));}
    assert.ok(pid);interrupted.kill('SIGTERM');await closed;
    assert.equal(JSON.parse(interruptionOutput).status,'reconciliation_required');
    assert.equal(query("select count(*) from pg_stat_activity where application_name='release-engine-test' and query like 'select pg_sleep(20)%'"),'0','interruption cancels the server statement and closes the sole session');
    assert.equal(query("select to_regclass('public.release_never') is null and to_regclass('public.release_later_never') is null"),'t');
    assert.equal(query("select outcome from release_control.attempts where digest=repeat('7',64)"),'unknown');
    // A false postcondition cannot be bypassed by a text value or privileged role.
    r=await apply({migrations:[one],query:"select 't'::text"},env); assert.notEqual(r.status,'succeeded');
    r=await apply({migrations:[one],query:'select pg_terminate_backend(pg_backend_pid())'},env); assert.notEqual(r.status,'succeeded');
    // Provenance format stays compatible with the existing gate's prefix/suffix.
    const provenance='-- applied to production from pull request #1016 head '+ 'a'.repeat(40)+' by operator, local release synthetic';
    r=await apply({migrations:[one],provenance},env); assert.equal(r.status,'succeeded');
    const marker=query("select s from supabase_migrations.schema_migrations,unnest(statements) s where name='test_1' and s like '-- applied to production from pull request #1016 head %'");
    assert.match(marker,/ \(file 20261015000001_test_1.sql\)$/);
    assert.equal(query("select (select s from unnest(coalesce(statements, '{}')) with ordinality as entry(s, position) where s like '-- applied to production % local release %' order by position desc limit 1) from supabase_migrations.schema_migrations where name='test_1'"),marker);
    // Version-only aliases must never be overwritten or treated as a skip.
    query("insert into supabase_migrations.schema_migrations values('20261015000008','unrelated',array['select 1;'])");
    r=await apply({migrations:[migration(8,'create table public.release_alias_never(id int);')]},env);
    assert.notEqual(r.status,'succeeded');
    assert.equal(query("select name from supabase_migrations.schema_migrations where version='20261015000008'"),'unrelated');
    assert.equal(query("select to_regclass('public.release_alias_never') is null"),'t');
    // Duplicate name/basename rows refuse even under reapply.
    query("insert into supabase_migrations.schema_migrations values('20261016000001','20261015000001_test_1',array['select 1;'])");
    r=await apply({migrations:[one],reapply:[one.name]},env); assert.notEqual(r.status,'succeeded');
    query("delete from supabase_migrations.schema_migrations where version='20261016000001'");
    // Reapply preserves old SQL evidence, then appends the exact new SQL.
    const repair={...one,sql:'insert into public.release_test_one values(1);\n'};
    r=await apply({migrations:[repair],reapply:[one.name],digest:'5'.repeat(64)},env);
    assert.equal(r.status,'succeeded'); assert.equal(query('select count(*) from public.release_test_one'),'1');
    assert.equal(query("select statements[2] = E'begin;\\ncreate table public.release_test_one(id int);\\ncommit;\\n' from supabase_migrations.schema_migrations where name='test_1'"),'t');
    r=await apply({migrations:[repair],reapply:[one.name],digest:'5'.repeat(64)},env);
    assert.notEqual(r.status,'succeeded'); assert.equal(query('select count(*) from public.release_test_one'),'1');
    // Large SQL is streamed over stdin, not argv, including nested dollar quotes.
    const large=migration(9,`do $$ begin perform '${'x'.repeat(150000)}'; end $$;\n`);
    r=await apply({migrations:[large]},env); assert.equal(r.status,'succeeded');
    assert.equal(Number(query("select length(statements[array_upper(statements,1)]) from supabase_migrations.schema_migrations where name='test_9'")),large.sql.length);
    // Final verification catches later SQL deleting an earlier ledger row.
    r=await apply({migrations:[repair,{name:'20261016000000_final_verify.sql',sql:"delete from supabase_migrations.schema_migrations where name='test_1';"}]},env);
    assert.notEqual(r.status,'succeeded'); assert.notEqual(r.ledgerVerified,true);
    query('drop schema release_control cascade');
    r=await apply({migrations:[{name:'20261016000001_no_bootstrap.sql',sql:'create table public.release_bootstrap_never(id int);'}],digest:'6'.repeat(64)},env);
    assert.notEqual(r.status,'succeeded'); assert.equal(query("select to_regclass('public.release_bootstrap_never') is null"),'t');
  } catch(error) {
    if (!started) console.error(readFileSync(join(root,'server.log'),'utf8'));
    throw error;
  } finally {
    if(started)run('pg_ctl',['-D',join(root,'data'),'-m','immediate','-w','stop']);
    rmSync(root,{recursive:true,force:true});
  }
});
