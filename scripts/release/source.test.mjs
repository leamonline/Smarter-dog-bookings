import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sources } from './preflight.mjs';

test('exact git blobs, append-only history, merged-tree validation and symlink rejection', () => {
  const root=mkdtempSync(join(tmpdir(),'release-source-test-'));
  const original=process.cwd();
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const name='20261015000000_original.sql', added='20261015000001_added.sql';
  try {
    git('init','-b','main'); git('config','user.name','Synthetic Release Test');git('config','user.email','test@example.invalid');git('remote','add','origin',root);
    mkdirSync(join(root,'scripts'));mkdirSync(join(root,'supabase/migrations'),{recursive:true});
    for(const file of ['check-migrations.mjs','migration-name.mjs'])writeFileSync(join(root,'scripts',file),readFileSync(join(original,'scripts',file)));
    writeFileSync(join(root,'package.json'),'{"type":"module"}\n');
    writeFileSync(join(root,'supabase/migrations',name),'select 1;\n');
    git('add','.');git('commit','-m','base');const main=git('rev-parse','HEAD');
    writeFileSync(join(root,'supabase/migrations',added),'select 2;\n');git('add','.');git('commit','-m','add');const source=git('rev-parse','HEAD');
    process.chdir(root);
    const result=sources(main,source,[added]);assert.equal(result[0].sql,'select 2;\n');
    writeFileSync(join(root,'supabase/migrations',name),'select 999;\n');git('add','.');git('commit','-m','edit history');
    assert.throws(()=>sources(main,git('rev-parse','HEAD'),[added]),/history/);
    git('reset','--hard',source);rmSync(join(root,'supabase/migrations',name));git('add','.');git('commit','-m','delete history');
    assert.throws(()=>sources(main,git('rev-parse','HEAD'),[added]),/history/);
    git('reset','--hard',source);writeFileSync(join(root,'supabase/migrations','20261015000001_collision.sql'),'select 3;');git('add','.');git('commit','-m','duplicate version');
    assert.throws(()=>sources(main,git('rev-parse','HEAD'),[added]));
    git('reset','--hard',source);rmSync(join(root,'supabase/migrations',added));symlinkSync('/tmp/untrusted.sql',join(root,'supabase/migrations',added));git('add','.');git('commit','-m','symlink');
    assert.throws(()=>sources(main,git('rev-parse','HEAD'),[added]),/symlink/);
    git('reset','--hard',source);writeFileSync(join(root,'supabase/migrations',added),Buffer.from([0xff,0xfe]));git('add','.');git('commit','-m','invalid utf8');
    assert.throws(()=>sources(main,git('rev-parse','HEAD'),[added]));
  } finally {process.chdir(original);rmSync(root,{recursive:true,force:true});}
});
