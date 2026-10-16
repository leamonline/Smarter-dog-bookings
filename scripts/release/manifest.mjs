import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { filename, postcondition, sha256, executable } from './engine.mjs';

export const REPOSITORY = 'leamonline/Smarter-dog-bookings';
export const PRODUCTION = 'nlzhllhkigmsvrzduefz';
export const STAGING = 'btjnxvgkpdbfrrqxvkfj';
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function shape(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join(',') !== keys.split(' ').sort().join(',')) throw Error('Unknown, missing or invalid manifest fields');
}
function string(value) { if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw Error('Expected nonempty text'); }
function sha(value) { if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw Error('Expected full commit SHA'); }
function hash(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Expected full SHA256'); }
function integer(value) { if (!Number.isSafeInteger(value) || value < 1) throw Error('Expected positive integer'); }
function unique(values) { if (!Array.isArray(values) || new Set(values).size !== values.length) throw Error('Expected unique array'); }
export function validate(manifest, now = Date.now()) {
  shape(manifest, 'version repository pr source main target project migrations reapply postcondition staging checks reviews createdAt expiresAt releaseId recovery');
  if (manifest.version !== 1 || manifest.repository !== REPOSITORY || manifest.target !== 'production' || manifest.project !== PRODUCTION) throw Error('Unsupported format or wrong target');
  integer(manifest.pr); sha(manifest.source); sha(manifest.main);
  if (!/^[a-f0-9-]{36}$/.test(manifest.releaseId)) throw Error('Invalid release ID');
  const created = Date.parse(manifest.createdAt), expires = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || new Date(created).toISOString() !== manifest.createdAt || new Date(expires).toISOString() !== manifest.expiresAt || expires - created !== 3600000 || created > now || expires <= now) throw Error('Expired or invalid 60-minute validity');
  if (!Array.isArray(manifest.migrations) || !manifest.migrations.length) throw Error('Missing migrations');
  for (const m of manifest.migrations) {
    shape(m, 'name sql sha256');
    if (!filename.test(m.name)) throw Error('Invalid migration basename');
    string(m.sql); hash(m.sha256);
    if (sha256(m.sql) !== m.sha256) throw Error('SQL hash mismatch');
    executable(m.sql);
  }
  unique(manifest.migrations.map(m => m.name)); unique(manifest.reapply);
  if (manifest.reapply.some(n => !manifest.migrations.some(m => m.name === n))) throw Error('Unauthorised reapply');
  shape(manifest.postcondition, 'sql sha256'); postcondition(manifest.postcondition.sql);
  if (sha256(manifest.postcondition.sql) !== manifest.postcondition.sha256) throw Error('Postcondition hash mismatch');
  shape(manifest.staging, 'project runId url source files tests');
  if (manifest.staging.project !== STAGING || manifest.staging.source !== manifest.source) throw Error('Wrong staging target or source');
  integer(manifest.staging.runId);
  if (manifest.staging.url !== `https://github.com/${REPOSITORY}/actions/runs/${manifest.staging.runId}`) throw Error('Invalid staging reference');
  if (!Array.isArray(manifest.staging.files) || canonical(manifest.staging.files) !== canonical(manifest.migrations.map(({ name, sha256 }) => ({ name, sha256 })))) throw Error('Staging SQL differs');
  unique(manifest.staging.tests); if (!manifest.staging.tests.length) throw Error('Missing staging validation');
  manifest.staging.tests.forEach(string);
  if (!Array.isArray(manifest.checks) || !manifest.checks.length) throw Error('Missing required checks');
  unique(manifest.checks.map(c => c.name));
  for (const c of manifest.checks) {
    shape(c, 'name id runId head conclusion appId'); string(c.name); integer(c.id); integer(c.runId); integer(c.appId);
    if (c.head !== manifest.source || (c.conclusion !== 'success' && !(c.name === 'migrations-applied' && c.conclusion === 'failure'))) throw Error('Missing, stale or red check');
  }
  if (!Array.isArray(manifest.reviews)) throw Error('Invalid reviews');
  for (const r of manifest.reviews) { shape(r, 'id user state commit'); integer(r.id); string(r.user); sha(r.commit); if (!['APPROVED', 'COMMENTED', 'DISMISSED'].includes(r.state)) throw Error('Changes requested or unknown review state'); }
  shape(manifest.recovery, 'locks compatibility partialApply rollback'); Object.values(manifest.recovery).forEach(string);
  return manifest;
}
export function seal(manifest) { validate(manifest); return { manifest, digest: sha256(canonical(manifest)) }; }
export function readPackage(path, now) {
  const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw Error('Package must be a bounded regular file');
  const text = readFileSync(path, 'utf8');
  const parsed = JSON.parse(text);
  // Requiring the canonical wire format rejects duplicate JSON members, as well
  // as alternate encodings. A permissive JSON.parse alone would lose duplicates.
  if (text !== canonical(parsed) + '\n') throw Error('Noncanonical or duplicate JSON fields');
  shape(parsed, 'manifest digest'); hash(parsed.digest); validate(parsed.manifest, now);
  if (sha256(canonical(parsed.manifest)) !== parsed.digest) throw Error('Package digest mismatch');
  return parsed;
}
export function makeManifest(input) {
  const createdAt = new Date().toISOString();
  return { ...input, version: 1, repository: REPOSITORY, target: 'production', project: PRODUCTION, releaseId: randomUUID(), createdAt, expiresAt: new Date(Date.parse(createdAt) + 3600000).toISOString() };
}
