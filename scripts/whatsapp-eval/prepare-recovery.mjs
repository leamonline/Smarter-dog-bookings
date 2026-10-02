/** Offline-only recovery preparation for the reviewed 20-complete / 8-remaining run. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [sourceArg, targetArg, ...extra] = process.argv.slice(2);
if (!sourceArg || !targetArg || extra.length) throw new Error('Usage: node scripts/whatsapp-eval/prepare-recovery.mjs source-directory new-directory');
const source = resolve(sourceArg), target = resolve(targetArg);
const repo = resolve(new URL('../..', import.meta.url).pathname);
if (source === target || target === repo || target.startsWith(repo + '/')) throw new Error('Use a new directory outside Git');
const read = (name) => readFileSync(join(source, name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(read('manifest.json'));
const incomplete = JSON.parse(read('incomplete.json'));
if (manifest.recovery || incomplete.completed !== 20 || incomplete.failedCase !== 'candidate-no-repeat') throw new Error('Not the reviewed recovery scope');
const jobs = ['base', 'candidate'].flatMap(label => {
 const bytes = read(`${label}-requests.json`);
 if (hash(bytes) !== manifest.requestHashes[label]) throw new Error('Request integrity failed');
 return JSON.parse(bytes).map(row => ({...row, label}));
});
if (jobs.length !== 28 || manifest.calls !== 28) throw new Error('Unexpected original scope');
const refused = JSON.parse(read('candidate-no-repeat.json'));
if (refused.status !== 400 || refused.outcome !== 'provider-error') throw new Error('Only reviewed definite HTTP refusal is recoverable');
const cache = jobs.slice(0,20).map(job => {
 const id = `${job.label}-${job.id}`, body = JSON.parse(read(`${id}.json`));
 if (body.type !== 'message' || !Array.isArray(body.content)) throw new Error(`Not a completed provider response: ${id}`);
 return {id, body};
});
for (const job of jobs.slice(21)) {
 if (readdirSync(source).includes(`${job.label}-${job.id}.json`)) throw new Error('Later response exists; refuse duplicate work');
}
const cacheBytes = JSON.stringify(cache, null, 2)+'\n';
mkdirSync(target, {recursive:true, mode:0o700});
if (readdirSync(target).length) throw new Error('Recovery target must be empty');
const save = (name, bytes) => writeFileSync(join(target,name), bytes, {flag:'wx',mode:0o600});
for (const label of ['base','candidate']) save(`${label}-requests.json`, read(`${label}-requests.json`));
save('cached-responses.json', cacheBytes);
save('manifest.json', JSON.stringify({...manifest,recovery:{source,completed:20,remainingCalls:8,cacheHash:hash(cacheBytes)}},null,2)+'\n');
console.log(`Prepared 8 provider requests; 20 responses reused. Original evidence unchanged. ${target}`);
