#!/usr/bin/env node
// Are the hosted Supabase advisors still the ones we have accepted?
//
// WHY THIS EXISTS
//
// The security and performance advisors on the hosted project report about
// two hundred findings. Every one of them has been read and either fixed or
// accepted with a reason (see docs/supabase-advisors.md). That judgement
// lived in a changelog sentence — "111 findings, the non-deliberate ones
// fixed" — which is a memory, not a check: a new finding lands among a
// hundred known ones and nobody sees it.
//
// This script turns the memory into a file. supabase/advisors/baseline.json
// records every accepted finding by the linter's own stable `cache_key`;
// the script pulls the live advisors through the Management API and diffs:
//
//   - a finding that is live but not in the baseline is NEW  → exit 1
//   - a finding whose level changed (INFO → WARN)  is NEW  → exit 1
//   - a finding in the baseline but no longer live is RESOLVED → exit 0,
//     with a note to refresh the baseline
//
// Refresh deliberately, after deciding each new finding is fixed or accepted:
//
//   SUPABASE_ACCESS_TOKEN=… npm run check:advisors -- --update
//
// Never refresh to make the check pass: the diff is the point.
//
// Needs SUPABASE_ACCESS_TOKEN (a personal or CI Management API token — the
// same secret the migration workflows use). The project ref comes from the
// baseline file, or SUPABASE_PROJECT_REF to override.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ADVISOR_TYPES = ["security", "performance"];
export const DEFAULT_BASELINE_PATH = "supabase/advisors/baseline.json";
const MANAGEMENT_API = "https://api.supabase.com/v1";

/**
 * Reduce a linter row to the fields the baseline records, sorted by the
 * linter's stable id so two runs over the same findings produce the same
 * bytes (and a meaningful git diff).
 */
export function normaliseLints(lints) {
  if (!Array.isArray(lints)) return [];
  return lints
    .filter((lint) => lint && typeof lint.cache_key === "string")
    .map((lint) => ({
      cache_key: lint.cache_key,
      name: String(lint.name ?? ""),
      level: String(lint.level ?? ""),
      detail: String(lint.detail ?? ""),
    }))
    .sort((a, b) => (a.cache_key < b.cache_key ? -1 : a.cache_key > b.cache_key ? 1 : 0));
}

/**
 * Compare one advisor type's live findings against its baseline. Pure, so
 * the decision is testable without a token or a network round trip.
 */
export function diffAdvisors(baselineEntries, liveEntries) {
  const baseline = new Map(normaliseLints(baselineEntries).map((e) => [e.cache_key, e]));
  const live = new Map(normaliseLints(liveEntries).map((e) => [e.cache_key, e]));
  const added = [];
  const relevelled = [];
  for (const [key, entry] of live) {
    const known = baseline.get(key);
    if (!known) added.push(entry);
    else if (known.level !== entry.level) {
      relevelled.push({ cache_key: key, name: entry.name, from: known.level, to: entry.level });
    }
  }
  const resolved = [...baseline.values()].filter((entry) => !live.has(entry.cache_key));
  return { added, relevelled, resolved };
}

/** True when the diff carries anything that should fail the check. */
export function hasNewFindings(diff) {
  return diff.added.length > 0 || diff.relevelled.length > 0;
}

function countByName(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Human-readable report for one or more advisor types. */
export function formatReport(diffByType) {
  const lines = [];
  for (const [type, diff] of Object.entries(diffByType)) {
    const status = hasNewFindings(diff) ? "NEW FINDINGS" : diff.resolved.length ? "resolved only" : "matches baseline";
    lines.push(`${type}: ${status}`);
    for (const entry of diff.added) {
      lines.push(`  + ${entry.level.padEnd(5)} ${entry.name}  ${entry.cache_key}`);
      if (entry.detail) lines.push(`      ${entry.detail}`);
    }
    for (const change of diff.relevelled) {
      lines.push(`  ~ ${change.from} → ${change.to}  ${change.name}  ${change.cache_key}`);
    }
    for (const [name, count] of countByName(diff.resolved)) {
      lines.push(`  - resolved: ${count} × ${name}`);
    }
  }
  return lines.join("\n");
}

export function readBaseline(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  for (const type of ADVISOR_TYPES) {
    if (!Array.isArray(parsed[type])) {
      throw new Error(`${filePath} has no "${type}" array`);
    }
  }
  return parsed;
}

export function buildBaseline({ projectRef, recordedAt, liveByType, previous = {} }) {
  const next = {
    $comment:
      previous.$comment ??
      "Supabase advisor baseline for the hosted project. Regenerate with `npm run check:advisors -- --update` after deliberately accepting or fixing findings; see docs/supabase-advisors.md.",
    project_ref: projectRef,
    recorded_at: recordedAt,
  };
  for (const type of ADVISOR_TYPES) next[type] = normaliseLints(liveByType[type]);
  return next;
}

async function fetchLints(type, { projectRef, token }) {
  const url = `${MANAGEMENT_API}/projects/${projectRef}/advisors/${type}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const body = await response.json();
  if (!Array.isArray(body?.lints)) {
    throw new Error(`Unexpected advisor payload for ${type}: no "lints" array`);
  }
  return body.lints;
}

async function main() {
  const update = process.argv.includes("--update");
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    process.stderr.write(
      "SUPABASE_ACCESS_TOKEN is not set — this check reads the hosted advisors through the Management API.\n",
    );
    process.exit(2);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(repoRoot, DEFAULT_BASELINE_PATH);
  const baseline = readBaseline(baselinePath);
  const projectRef = process.env.SUPABASE_PROJECT_REF || baseline.project_ref;
  if (!projectRef) {
    process.stderr.write("No project ref: set SUPABASE_PROJECT_REF or baseline.project_ref.\n");
    process.exit(2);
  }

  const liveByType = {};
  for (const type of ADVISOR_TYPES) {
    liveByType[type] = await fetchLints(type, { projectRef, token });
  }

  const diffByType = {};
  for (const type of ADVISOR_TYPES) {
    diffByType[type] = diffAdvisors(baseline[type], liveByType[type]);
  }
  process.stdout.write(`${formatReport(diffByType)}\n`);

  const anyNew = Object.values(diffByType).some(hasNewFindings);
  const anyResolved = Object.values(diffByType).some((d) => d.resolved.length > 0);

  if (update) {
    const next = buildBaseline({
      projectRef,
      recordedAt: new Date().toISOString().slice(0, 10),
      liveByType,
      previous: baseline,
    });
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    process.stdout.write(`Baseline rewritten at ${DEFAULT_BASELINE_PATH} — review the diff before committing.\n`);
    return;
  }
  if (anyNew) {
    process.stdout.write(
      "\nNew or escalated advisor findings. Fix them, or accept them with a reason in docs/supabase-advisors.md and refresh the baseline with --update.\n",
    );
    process.exit(1);
  }
  if (anyResolved) {
    process.stdout.write(
      "\nSome baseline findings are resolved. Refresh the baseline with --update so the file matches the project.\n",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exit(1);
  });
}
