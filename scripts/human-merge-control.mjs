#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTROL_START_MARKER = "<!-- human-merge-control:start -->";
export const CONTROL_END_MARKER = "<!-- human-merge-control:end -->";
export const APPROVED_MERGE_ACTORS = Object.freeze(["leamonline"]);

const CONTROL_NAME = "human-merge-control";
const MAX_APPROVAL_AGE_MS = 15 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const APPLIED_MIGRATION_PATTERN =
  /^APPLIED: (https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/actions\/runs\/\d+\/job\/\d+)$/;

const REQUIRED_ACTIONS_CHECKS = Object.freeze({
  build: ".github/workflows/ci.yml",
  "agent-tests": ".github/workflows/ci.yml",
  "pr-production-smoke": ".github/workflows/ci.yml",
  "migrations-applied": ".github/workflows/check-migrations-applied.yml",
});

const FIELD_PREFIXES = Object.freeze([
  ["decision", "Decision:"],
  ["headSha", "Approved head SHA:"],
  ["baseSha", "Approved base SHA:"],
  ["approvedBy", "Approved by:"],
  ["approvedAt", "Approved at (UTC):"],
  ["migrationReview", "Migration review:"],
]);

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function parseUtcTimestamp(value, fieldName) {
  if (!UTC_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a UTC timestamp ending in Z.`);
  }

  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().replace(".000Z", "Z") !== value
  ) {
    throw new Error(`${fieldName} must be a valid UTC timestamp.`);
  }

  return milliseconds;
}

function normaliseLogin(value) {
  return value.toLowerCase();
}

/**
 * Parse the one machine-readable merge-control block in a pull-request body.
 * This function performs syntax validation only; HOLD intentionally permits
 * empty approval fields so a new pull request starts in a safe state.
 */
export function parseHumanMergeAttestation(body) {
  if (
    typeof body !== "string" ||
    countOccurrences(body, CONTROL_START_MARKER) !== 1 ||
    countOccurrences(body, CONTROL_END_MARKER) !== 1
  ) {
    throw new Error("Expected exactly one human merge-control block.");
  }

  const start = body.indexOf(CONTROL_START_MARKER);
  const end = body.indexOf(CONTROL_END_MARKER);
  if (end <= start) {
    throw new Error("Expected exactly one human merge-control block.");
  }

  const block = body
    .slice(start + CONTROL_START_MARKER.length, end)
    .replaceAll("\r", "")
    .trim();
  const lines = block === "" ? [] : block.split("\n").map((line) => line.trim());

  if (lines.length !== FIELD_PREFIXES.length) {
    throw new Error("Human merge-control block has an unexpected or duplicated field.");
  }

  const values = {};
  for (let index = 0; index < FIELD_PREFIXES.length; index += 1) {
    const [field, prefix] = FIELD_PREFIXES[index];
    const line = lines[index];
    if (line !== prefix && !line.startsWith(`${prefix} `)) {
      throw new Error("Human merge-control block has an unexpected or duplicated field.");
    }
    values[field] = line.slice(prefix.length).trim();
  }

  if (!new Set(["HOLD", "MERGE"]).has(values.decision)) {
    throw new Error("Decision must be exactly HOLD or MERGE.");
  }

  for (const [field, label] of [
    ["headSha", "Approved head SHA"],
    ["baseSha", "Approved base SHA"],
  ]) {
    if (values[field] !== "" && !SHA_PATTERN.test(values[field])) {
      throw new Error(`${label} must be a full 40-character commit SHA.`);
    }
  }

  let approvedBy = "";
  if (values.approvedBy !== "") {
    if (!values.approvedBy.startsWith("@")) {
      throw new Error("Approved by must be a GitHub login prefixed with @.");
    }
    approvedBy = normaliseLogin(values.approvedBy.slice(1));
    if (!GITHUB_LOGIN_PATTERN.test(approvedBy)) {
      throw new Error("Approved by must contain a valid GitHub login.");
    }
    if (new Set(["username", "github-username", "your-username"]).has(approvedBy)) {
      throw new Error("Approved by must not contain a placeholder username.");
    }
  }

  if (values.approvedAt !== "") {
    parseUtcTimestamp(values.approvedAt, "Approved at (UTC)");
  }

  if (
    values.migrationReview !== "HOLD" &&
    values.migrationReview !== "NO_MIGRATIONS" &&
    !APPLIED_MIGRATION_PATTERN.test(values.migrationReview)
  ) {
    throw new Error(
      "Migration review must be HOLD, NO_MIGRATIONS or APPLIED: <GitHub Actions job URL>.",
    );
  }

  return {
    decision: values.decision,
    headSha: values.headSha.toLowerCase(),
    baseSha: values.baseSha.toLowerCase(),
    approvedBy,
    approvedAt: values.approvedAt,
    migrationReview: values.migrationReview,
  };
}

function hold(reason) {
  return { ok: false, summary: `HOLD: ${reason}` };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} response was not an array.`);
  }
  return value;
}

function validatePullRequestSnapshot(snapshot, label) {
  if (!isObject(snapshot)) return `${label} pull-request read is missing.`;
  if (snapshot.state !== "open") return `${label} pull request must remain open.`;
  if (snapshot.draft !== false) return `${label} pull request must not be a draft.`;
  if (!isObject(snapshot.head) || !SHA_PATTERN.test(snapshot.head.sha ?? "")) {
    return `${label} pull-request head SHA is invalid.`;
  }
  if (!isObject(snapshot.base) || snapshot.base.ref !== "main") {
    return `${label} pull request must target main.`;
  }
  if (typeof snapshot.body !== "string") {
    return `${label} pull-request body is missing.`;
  }
  if (!Number.isSafeInteger(snapshot.changedFiles) || snapshot.changedFiles < 0) {
    return `${label} pull-request changed-files count is invalid.`;
  }
  try {
    parseUtcTimestamp(snapshot.updatedAt, `${label} pull-request updated_at`);
  } catch (_err) {
    return `${label} pull-request updated_at is invalid.`;
  }
  return null;
}

function parseActionsRunId(detailsUrl) {
  if (typeof detailsUrl !== "string") return null;
  const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/|$)/);
  if (!match) return null;
  const runId = Number(match[1]);
  return Number.isSafeInteger(runId) ? runId : null;
}

function selectActionsEvidence(input, headSha) {
  const checkRuns = asArray(input.checkRuns, "Check-runs");
  const workflowRuns = asArray(input.workflowRuns, "Actions-runs");
  const evidence = [];
  const selected = new Map();

  for (const [name, expectedPath] of Object.entries(REQUIRED_ACTIONS_CHECKS)) {
    const candidates = checkRuns.filter((check) => isObject(check) && check.name === name);
    if (candidates.length === 0) {
      return { error: `Required Actions check ${name} is missing.` };
    }
    if (candidates.length !== 1) {
      return { error: `Ambiguous required Actions check ${name}.` };
    }

    const check = candidates[0];
    if (!isObject(check.app) || check.app.slug !== "github-actions") {
      return { error: `${name} must come from the github-actions app.` };
    }
    if (normaliseSha(check.head_sha) !== headSha) {
      return { error: `${name} is not attached to the current head SHA.` };
    }
    if (check.status !== "completed" || check.conclusion !== "success") {
      return { error: `${name} must be completed successfully.` };
    }

    let completedAt;
    try {
      completedAt = parseUtcTimestamp(check.completed_at, `${name} completed_at`);
    } catch (_err) {
      return { error: `${name} has no valid UTC completion time.` };
    }

    const runId = parseActionsRunId(check.details_url);
    if (runId === null) {
      return { error: `${name} has no verifiable Actions run URL.` };
    }
    const runs = workflowRuns.filter((run) => isObject(run) && run.id === runId);
    if (runs.length !== 1) {
      return { error: `${name} has no unambiguous originating Actions run.` };
    }
    const run = runs[0];
    if (run.event !== "pull_request") {
      return { error: `${name} must originate from a pull_request run.` };
    }
    if (normaliseSha(run.head_sha) !== headSha) {
      return { error: `${name} Actions run has the wrong head SHA.` };
    }
    if (run.path !== expectedPath) {
      return { error: `${name} Actions run has the wrong workflow path.` };
    }
    if (run.status !== "completed" || run.conclusion !== "success") {
      return { error: `${name} Actions run must be completed successfully.` };
    }

    selected.set(name, check);
    evidence.push(completedAt);
  }

  return { selected, evidence };
}

function normaliseSha(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function selectVercelEvidence(statuses) {
  const allStatuses = asArray(statuses, "Commit-statuses");
  const exactContext = allStatuses.filter(
    (status) => isObject(status) && status.context === "Vercel",
  );
  if (exactContext.length === 0) {
    return { error: "Required Vercel status is missing." };
  }

  const withTimes = [];
  for (const status of exactContext) {
    let updatedAt;
    try {
      updatedAt = parseUtcTimestamp(status.updated_at, "Vercel updated_at");
    } catch (_err) {
      return { error: "Vercel status has no valid UTC update time." };
    }
    withTimes.push({ status, updatedAt });
  }
  withTimes.sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    return Number(right.status.id ?? 0) - Number(left.status.id ?? 0);
  });

  const latest = withTimes[0];
  if (
    !isObject(latest.status.creator) ||
    latest.status.creator.login !== "vercel[bot]"
  ) {
    return { error: "The newest Vercel status must come from vercel[bot]." };
  }
  if (latest.status.state !== "success") {
    return { error: "The newest Vercel status must report success." };
  }

  let target;
  try {
    target = new URL(latest.status.target_url);
  } catch (_err) {
    return { error: "The Vercel status must link to vercel.com." };
  }
  if (
    target.protocol !== "https:" ||
    target.hostname !== "vercel.com"
  ) {
    return { error: "The Vercel status must link to vercel.com." };
  }

  return { evidence: latest.updatedAt };
}

function validateMigrationDisposition(files, attestation, migrationCheck) {
  const migrationFiles = asArray(files, "Pull-request files").filter(
    (file) => {
      if (!isObject(file)) return false;
      const paths = [file.filename, file.previous_filename].filter(
        (path) => typeof path === "string",
      );
      return paths.some(
        (path) =>
          path.startsWith("supabase/migrations/") && path.endsWith(".sql"),
      );
    },
  );

  if (migrationFiles.some((file) => file.status !== "added")) {
    return "Migration history is append-only; modified, removed or renamed SQL is forbidden.";
  }

  if (migrationFiles.length === 0) {
    if (attestation.migrationReview !== "NO_MIGRATIONS") {
      return "Migration review must be NO_MIGRATIONS when no migration SQL was added.";
    }
    return null;
  }

  const applied = attestation.migrationReview.match(APPLIED_MIGRATION_PATTERN);
  if (!applied) {
    return "Migration review must be APPLIED with the successful migrations-applied job URL.";
  }
  if (applied[1] !== migrationCheck.details_url) {
    return "Migration review APPLIED URL must match the successful migrations-applied check.";
  }
  return null;
}

function evaluate(input) {
  if (!isObject(input)) return hold("Evaluator input is missing.");
  if (input.action !== "edited") {
    return hold("Approval requires a fresh pull-request body edit.");
  }
  if (input.bodyChanged !== true) {
    return hold("The edited event did not contain a real body edit.");
  }

  if (!isObject(input.sender) || input.sender.type !== "User") {
    return hold("Approval requires an authenticated human editor.");
  }
  const sender = normaliseLogin(String(input.sender.login ?? ""));
  const approvers = new Set(
    asArray(input.approvers ?? APPROVED_MERGE_ACTORS, "Approvers").map((login) =>
      normaliseLogin(String(login)),
    ),
  );
  if (!approvers.has(sender)) {
    return hold("The human editor is not an authorised merge approver.");
  }
  if (normaliseLogin(String(input.actor ?? "")) !== sender) {
    return hold("The workflow actor does not match the human editor.");
  }
  if (normaliseLogin(String(input.triggeringActor ?? "")) !== sender) {
    return hold("The workflow triggering actor does not match the human editor.");
  }
  if (input.runAttempt !== 1) {
    return hold("Workflow re-runs cannot approve an old body-edit event.");
  }

  const initialProblem = validatePullRequestSnapshot(input.initialPullRequest, "Initial");
  if (initialProblem) return hold(initialProblem);
  const finalProblem = validatePullRequestSnapshot(input.finalPullRequest, "Final");
  if (finalProblem) return hold(finalProblem);

  const initial = input.initialPullRequest;
  const final = input.finalPullRequest;
  if (initial.number !== final.number) {
    return hold("Pull-request identity changed during evaluation.");
  }
  if (normaliseSha(initial.head.sha) !== normaliseSha(final.head.sha)) {
    return hold("Pull-request head SHA changed during evaluation.");
  }
  if (initial.body !== final.body) {
    return hold("Pull-request body changed during evaluation.");
  }
  if (initial.updatedAt !== final.updatedAt) {
    return hold("Pull-request updated_at changed during evaluation.");
  }
  if (initial.changedFiles !== final.changedFiles) {
    return hold("Pull-request file count changed during evaluation.");
  }

  const files = asArray(input.files, "Pull-request files");
  if (files.length !== initial.changedFiles) {
    return hold("Pull-request file list is incomplete.");
  }

  if (isObject(input.eventPullRequest)) {
    const eventHead = normaliseSha(input.eventPullRequest.head?.sha);
    if (eventHead !== normaliseSha(initial.head.sha)) {
      return hold("Pull-request head SHA changed after the edited event.");
    }
    if (input.eventPullRequest.base?.ref !== initial.base.ref) {
      return hold("Pull-request target branch changed after the edited event.");
    }
    if (input.eventPullRequest.body !== initial.body) {
      return hold("Pull-request body changed after the edited event.");
    }
    if (input.eventPullRequest.updatedAt !== initial.updatedAt) {
      return hold("Pull-request updated_at changed after the edited event.");
    }
  }

  let attestation;
  try {
    attestation = parseHumanMergeAttestation(final.body);
  } catch (err) {
    return hold(err instanceof Error ? err.message : "Merge attestation is malformed.");
  }
  if (attestation.decision !== "MERGE") {
    return hold("Decision remains HOLD.");
  }
  if (attestation.approvedBy !== sender) {
    return hold("Approved by must match the authenticated human editor.");
  }

  const headSha = normaliseSha(final.head.sha);
  const initialBaseSha = normaliseSha(input.initialBaseSha);
  const finalBaseSha = normaliseSha(input.finalBaseSha);
  if (!SHA_PATTERN.test(initialBaseSha) || !SHA_PATTERN.test(finalBaseSha)) {
    return hold("Current main SHA is invalid.");
  }
  if (initialBaseSha !== finalBaseSha) {
    return hold("Current main changed during evaluation.");
  }
  if (attestation.headSha !== headSha) {
    return hold("Approved head SHA is not the current pull-request head.");
  }
  if (attestation.baseSha !== finalBaseSha) {
    return hold("Approved base SHA is not the current main SHA.");
  }

  const comparison = input.baseComparison;
  if (
    !isObject(comparison) ||
    !new Set(["ahead", "identical"]).has(comparison.status) ||
    normaliseSha(comparison.base_commit?.sha) !== finalBaseSha ||
    normaliseSha(comparison.merge_base_commit?.sha) !== finalBaseSha
  ) {
    return hold("Approved head must contain the current main commit.");
  }

  const actions = selectActionsEvidence(input, headSha);
  if (actions.error) return hold(actions.error);
  const vercel = selectVercelEvidence(input.statuses);
  if (vercel.error) return hold(vercel.error);

  const migrationProblem = validateMigrationDisposition(
    files,
    attestation,
    actions.selected.get("migrations-applied"),
  );
  if (migrationProblem) return hold(migrationProblem);

  if (attestation.approvedAt === "") {
    return hold("Approved at (UTC) is required for MERGE.");
  }
  const approvedAt = parseUtcTimestamp(attestation.approvedAt, "Approved at (UTC)");
  const bodyEditedAt = parseUtcTimestamp(
    final.updatedAt,
    "Authenticated pull-request body edit",
  );
  const now = parseUtcTimestamp(input.now, "Evaluation time");
  const latestEvidence = Math.max(...actions.evidence, vercel.evidence);
  if (bodyEditedAt <= latestEvidence) {
    return hold("The authenticated body edit must occur after all required evidence completed.");
  }
  if (approvedAt <= latestEvidence) {
    return hold("Approval must be recorded after all required evidence completed.");
  }
  if (bodyEditedAt > now + MAX_FUTURE_SKEW_MS) {
    return hold("Authenticated body-edit timestamp must not be in the future.");
  }
  if (approvedAt > now + MAX_FUTURE_SKEW_MS) {
    return hold("Approval timestamp must not be in the future.");
  }
  if (now - bodyEditedAt > MAX_APPROVAL_AGE_MS) {
    return hold("Authenticated body edit is too old; submit a fresh pull-request body edit.");
  }
  if (now - approvedAt > MAX_APPROVAL_AGE_MS) {
    return hold("Approval is too old; submit a fresh pull-request body edit.");
  }

  return {
    ok: true,
    summary: `Approved ${headSha.slice(0, 7)} by @${sender} for main at ${attestation.approvedAt}.`,
  };
}

/**
 * Evaluate a complete, already-fetched evidence bundle. Malformed untrusted
 * data is a HOLD result, never an exception that could be mistaken for green.
 */
export function evaluateHumanMergeControl(input) {
  try {
    return evaluate(input);
  } catch (err) {
    return hold(err instanceof Error ? err.message : "Evaluator input is invalid.");
  }
}

class GitHubRestClient {
  constructor({ apiUrl, repository, token }) {
    if (typeof apiUrl !== "string" || !apiUrl.startsWith("https://")) {
      throw new Error("GITHUB_API_URL must be an HTTPS URL.");
    }
    if (typeof repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
      throw new Error("GITHUB_REPOSITORY must contain owner/name.");
    }
    if (typeof token !== "string" || token === "") {
      throw new Error("GITHUB_TOKEN is required.");
    }
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.repository = repository;
    this.token = token;
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "smarter-dog-human-merge-control",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${path.split("?")[0]} returned ${response.status}.`);
    }
    if (response.status === 204) return null;

    try {
      return await response.json();
    } catch (_err) {
      throw new Error(`GitHub API ${method} ${path.split("?")[0]} returned invalid JSON.`);
    }
  }

  async paginate(path, selectPage) {
    const results = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await this.request(`${path}${separator}per_page=100&page=${page}`);
      const entries = selectPage(payload);
      if (!Array.isArray(entries)) {
        throw new Error(`GitHub API ${path.split("?")[0]} returned an invalid page.`);
      }
      results.push(...entries);
      if (entries.length < 100) return results;
    }
    throw new Error(`GitHub API ${path.split("?")[0]} exceeded the pagination limit.`);
  }
}

function repositoryPath(repository) {
  return `/repos/${repository.split("/").map(encodeURIComponent).join("/")}`;
}

async function publishControlStatus(
  client,
  { headSha, state, detailsUrl, description },
) {
  const root = repositoryPath(client.repository);
  const response = await client.request(`${root}/statuses/${encodeURIComponent(headSha)}`, {
    method: "POST",
    body: {
      state,
      context: CONTROL_NAME,
      target_url: detailsUrl,
      description: description.slice(0, 140),
    },
  });
  if (
    !isObject(response) ||
    response.context !== CONTROL_NAME ||
    response.state !== state
  ) {
    throw new Error("GitHub did not confirm the human-merge-control status.");
  }
}

function pullRequestSnapshot(payload) {
  if (!isObject(payload)) throw new Error("GitHub returned an invalid pull request.");
  if (!Number.isSafeInteger(payload.number) || payload.number < 1) {
    throw new Error("GitHub returned a pull request without a valid number.");
  }
  parseUtcTimestamp(payload.updated_at, "Pull-request updated_at");
  return {
    number: payload.number,
    state: payload.state,
    draft: payload.draft,
    body: payload.body,
    updatedAt: payload.updated_at,
    changedFiles: payload.changed_files,
    head: { sha: payload.head?.sha },
    // GitHub's pull-request base.sha is the base commit captured for the PR,
    // not a reliable view of the current target-branch tip. Keep only base.ref;
    // current main is read independently through the commits API.
    base: { ref: payload.base?.ref },
  };
}

function commitSha(payload, label) {
  if (!isObject(payload) || !SHA_PATTERN.test(payload.sha ?? "")) {
    throw new Error(`GitHub returned an invalid ${label} commit.`);
  }
  return normaliseSha(payload.sha);
}

function requiredRunIds(checkRuns) {
  const ids = new Set();
  for (const name of Object.keys(REQUIRED_ACTIONS_CHECKS)) {
    const candidates = checkRuns.filter(
      (check) => isObject(check) && check.name === name,
    );
    if (candidates.length !== 1) continue;
    const runId = parseActionsRunId(candidates[0].details_url);
    if (runId !== null) ids.add(runId);
  }
  return [...ids];
}

function requiredString(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function readEvent(eventPath) {
  let source;
  try {
    source = await readFile(eventPath, "utf8");
  } catch (_err) {
    throw new Error("GITHUB_EVENT_PATH could not be read.");
  }
  try {
    return JSON.parse(source);
  } catch (_err) {
    throw new Error("GITHUB_EVENT_PATH did not contain valid JSON.");
  }
}

/** Run the GitHub adapter. A policy HOLD is a successful publisher run. */
export async function runHumanMergeControl(env = process.env) {
  let client = null;
  let headSha = "";
  let detailsUrl = "";
  try {
    if (requiredString(env, "GITHUB_EVENT_NAME") !== "pull_request_target") {
      throw new Error("GITHUB_EVENT_NAME must be pull_request_target.");
    }
    const eventPath = requiredString(env, "GITHUB_EVENT_PATH");
    const repository = requiredString(env, "GITHUB_REPOSITORY");
    const apiUrl = requiredString(env, "GITHUB_API_URL");
    const token = requiredString(env, "GITHUB_TOKEN");
    const actor = requiredString(env, "GITHUB_ACTOR");
    const triggeringActor = requiredString(env, "GITHUB_TRIGGERING_ACTOR");
    const runId = requiredString(env, "GITHUB_RUN_ID");
    const serverUrl = requiredString(env, "GITHUB_SERVER_URL").replace(/\/$/, "");
    const runAttempt = Number(requiredString(env, "GITHUB_RUN_ATTEMPT"));
    if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) {
      throw new Error("GITHUB_RUN_ATTEMPT must be a positive integer.");
    }

    const event = await readEvent(eventPath);
    if (!isObject(event) || !isObject(event.pull_request)) {
      throw new Error("The event is not a pull-request event.");
    }
    const number = event.pull_request.number ?? event.number;
    headSha = normaliseSha(event.pull_request.head?.sha);
    if (!Number.isSafeInteger(number) || number < 1 || !SHA_PATTERN.test(headSha)) {
      throw new Error("The event has no valid pull-request number or head SHA.");
    }

    client = new GitHubRestClient({ apiUrl, repository, token });
    detailsUrl = `${serverUrl}/${repository}/actions/runs/${encodeURIComponent(runId)}`;
    await publishControlStatus(client, {
      headSha,
      state: "pending",
      detailsUrl,
      description: "HOLD while trusted base-branch code evaluates this pull request.",
    });
    const root = repositoryPath(repository);
    const initialRaw = await client.request(`${root}/pulls/${number}`);
    const initialPullRequest = pullRequestSnapshot(initialRaw);
    const initialBaseSha = commitSha(
      await client.request(`${root}/commits/main`),
      "main",
    );
    const baseComparison = await client.request(
      `${root}/compare/${encodeURIComponent(initialBaseSha)}...${encodeURIComponent(headSha)}`,
    );
    const files = await client.paginate(
      `${root}/pulls/${number}/files`,
      (payload) => payload,
    );
    const checkRuns = await client.paginate(
      `${root}/commits/${encodeURIComponent(headSha)}/check-runs?filter=latest`,
      (payload) => (isObject(payload) ? payload.check_runs : null),
    );
    const statuses = await client.paginate(
      `${root}/commits/${encodeURIComponent(headSha)}/statuses`,
      (payload) => payload,
    );

    const workflowRuns = [];
    for (const actionsRunId of requiredRunIds(checkRuns)) {
      workflowRuns.push(await client.request(`${root}/actions/runs/${actionsRunId}`));
    }
    const finalRaw = await client.request(`${root}/pulls/${number}`);
    const finalPullRequest = pullRequestSnapshot(finalRaw);
    const finalBaseSha = commitSha(
      await client.request(`${root}/commits/main`),
      "main",
    );

    const result = evaluateHumanMergeControl({
      action: event.action,
      bodyChanged:
        event.action === "edited" &&
        isObject(event.changes) &&
        Object.prototype.hasOwnProperty.call(event.changes, "body"),
      sender: event.sender,
      actor,
      triggeringActor,
      runAttempt,
      approvers: APPROVED_MERGE_ACTORS,
      now: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      eventPullRequest: pullRequestSnapshot(event.pull_request),
      initialPullRequest,
      finalPullRequest,
      initialBaseSha,
      finalBaseSha,
      baseComparison,
      checkRuns,
      workflowRuns,
      statuses,
      files,
    });

    await publishControlStatus(client, {
      headSha,
      state: result.ok ? "success" : "failure",
      detailsUrl,
      description: result.summary,
    });
    console.log(`Human merge control: ${result.summary}`);
    return 0;
  } catch (_err) {
    if (client !== null && SHA_PATTERN.test(headSha) && detailsUrl !== "") {
      try {
        await publishControlStatus(client, {
          headSha,
          state: "failure",
          detailsUrl,
          description: "HOLD because the trusted publisher failed internally.",
        });
      } catch (_recoveryError) {
        // The failed workflow run remains mandatory human evidence when the
        // best-effort non-green recovery write cannot be confirmed.
      }
    }
    console.error(
      "Human merge control failed internally; a non-green recovery was attempted and this failed run remains HOLD.",
    );
    return 1;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/human-merge-control.mjs [--help]

Evaluate a pull_request_target event from GITHUB_EVENT_PATH and publish the
head-bound ${CONTROL_NAME} commit status. Policy HOLD results publish failure
and exit successfully; only an internal or GitHub API failure exits non-zero.`);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    printHelp();
    return 0;
  }
  if (args.length !== 0) {
    console.error("Unknown argument. Use --help for usage.");
    return 2;
  }
  return runHumanMergeControl(env);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  process.exitCode = await main();
}
