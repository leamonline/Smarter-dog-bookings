#!/usr/bin/env node
// Shared fail-closed Supabase MCP migration and target guard for Claude Code,
// Antigravity and (documented-only) Codex CLI/hook setups.
//
// Keeps canonical project refs and target-classification rules in one place so
// agent-specific hook configurations stay thin compatibility layers:
// - Staging (`btjnxvgkpdbfrrqxvkfj`) is the only hosted development target
//   permitted without a prompt for `apply_migration`.
// - Production (`nlzhllhkigmsvrzduefz`), missing project_id, unknown targets and
//   malformed payloads are explicitly denied (`deny`) for `apply_migration` and
//   for mutating Supabase MCP tools (`execute_sql`, `deploy_edge_function`, etc.).
// - Strictly read-only Supabase MCP tools defer to per-call human confirmation
//   (`force_ask` in Antigravity, `ask` in Claude Code).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGING_PROJECT_REF = "btjnxvgkpdbfrrqxvkfj";
export const PRODUCTION_PROJECT_REF = "nlzhllhkigmsvrzduefz";
export const AUTHORISED_DEV_REFS = new Set([STAGING_PROJECT_REF]);

const SUPABASE_PROJECTLESS_READ_TOOLS = new Set([
  "list_projects",
  "list_organizations",
  "search_docs",
  "get_organization",
]);

const SUPABASE_PROJECT_READ_TOOLS = new Set([
  "list_tables",
  "list_extensions",
  "list_migrations",
  "get_advisors",
  "get_project_url",
  "get_publishable_keys",
  "generate_typescript_types",
  "list_edge_functions",
  "get_edge_function",
  "list_branches",
  "list_notebooks",
  "get_notebook",
  "get_project",
  "query_logs",
]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatRefForMessage(projectId) {
  if (typeof projectId !== "string" || projectId.length === 0) return "none";
  return projectId.slice(0, 64);
}

/**
 * Classifies a `project_id` value strictly without trimming or case folding.
 * Any non-string, empty, whitespace-padded or unrecognised value fails closed.
 */
export function classifyProjectRef(projectId) {
  if (typeof projectId !== "string" || projectId.length === 0) {
    return { kind: "missing", projectId: null };
  }
  if (AUTHORISED_DEV_REFS.has(projectId)) {
    return { kind: "staging", projectId };
  }
  if (projectId === PRODUCTION_PROJECT_REF) {
    return { kind: "production", projectId };
  }
  return { kind: "unknown", projectId };
}

function claudeResponse(permissionDecision, permissionDecisionReason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason,
    },
  };
}

function antigravityResponse(decision, reason) {
  return { decision, reason };
}

function parseJsonObject(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "empty input" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return { ok: false, error: "payload is not a JSON object" };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid JSON" };
  }
}

function parseArgumentsObject(rawArgs) {
  if (rawArgs === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof rawArgs === "string") {
    return parseJsonObject(rawArgs);
  }
  if (isPlainObject(rawArgs)) {
    return { ok: true, value: rawArgs };
  }
  return { ok: false, error: "Arguments must be an object or JSON object string" };
}

function isSupabaseServerName(serverName) {
  return (
    serverName === "supabase_mcp" ||
    serverName === "supabase" ||
    serverName.includes("supabase")
  );
}

function isApplyMigrationToolName(toolName) {
  return toolName === "apply_migration" || toolName.endsWith("apply_migration");
}

function evaluateBashCommandForSupabase(command) {
  if (typeof command !== "string") {
    return claudeResponse("deny", "Bash guard blocked non-string command payload.");
  }

  // Split chained shell segments while keeping detection simple and fail-closed.
  const segments = command.split(/(?:&&|\|\||[;\n|])/);
  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    // Detect direct Supabase CLI mutations (outside the repository's guarded wrappers).
    const isSupabaseCli = /^(?:env\s+[^\s=]+=[^\s]+\s+)*(?:npx\s+(?:--no-install\s+)?)?(?:\S*\/)?supabase(?:\s|$)/i.test(
      segment,
    );
    const cliMutation = isSupabaseCli
      ? segment.match(
          /\b(db\s+push|migration\s+(?:up|repair)|functions\s+deploy|secrets\s+(?:set|unset))\b/i,
        )
      : null;
    if (cliMutation) {
      const subcommand = cliMutation[1].toLowerCase();
      if (subcommand === "db push" || subcommand.startsWith("migration ")) {
        return claudeResponse(
          "deny",
          `Blocked direct \`supabase ${subcommand}\` in agent shell; use disposable local tests or the target-verified migration workflows.`,
        );
      }
      if (
        !segment.includes(`--project-ref ${STAGING_PROJECT_REF}`) &&
        !segment.includes(`--project-ref=${STAGING_PROJECT_REF}`)
      ) {
        return claudeResponse(
          "deny",
          `Blocked direct \`supabase ${subcommand}\` without explicit staging --project-ref (${STAGING_PROJECT_REF}).`,
        );
      }
      if (segment.includes(PRODUCTION_PROJECT_REF)) {
        return claudeResponse(
          "deny",
          `Blocked direct \`supabase ${subcommand}\` targeting production (${PRODUCTION_PROJECT_REF}).`,
        );
      }
    }

    // Detect direct Management API calls targeting production or unverified targets.
    const isReadOnlySearch = /^(?:git\s+(?:grep|log|show|diff)|grep|rg|echo|printf)\b/i.test(
      segment,
    );
    if (!isReadOnlySearch && /api\.supabase\.com\/v1\/projects\//i.test(segment)) {
      if (segment.includes(PRODUCTION_PROJECT_REF)) {
        return claudeResponse(
          "deny",
          `Blocked direct Supabase Management API call targeting production (${PRODUCTION_PROJECT_REF}).`,
        );
      }
      if (!segment.includes(STAGING_PROJECT_REF)) {
        return claudeResponse(
          "deny",
          "Blocked direct Supabase Management API call without verified staging project ref.",
        );
      }
    }
  }

  // Empty JSON object defers non-Supabase shell commands to Claude Code's own permission rules.
  return {};
}

function evaluateClaudeSupabaseTool(mcpToolName, toolInput) {
  if (isApplyMigrationToolName(mcpToolName)) {
    const classification = classifyProjectRef(toolInput.project_id);
    switch (classification.kind) {
      case "staging":
        return claudeResponse(
          "allow",
          `apply_migration on staging (${classification.projectId}) is allowed without a prompt.`,
        );
      case "production":
        return claudeResponse(
          "deny",
          `Blocked MCP apply_migration against production (${classification.projectId}). Production migrations must use the target-verified production workflow.`,
        );
      case "missing":
        return claudeResponse(
          "deny",
          "Blocked MCP apply_migration because project_id is missing or invalid (fail-closed).",
        );
      default:
        return claudeResponse(
          "deny",
          `Blocked MCP apply_migration against unrecognised project_id ('${formatRefForMessage(classification.projectId)}'); only staging (${STAGING_PROJECT_REF}) is permitted.`,
        );
    }
  }

  if (
    SUPABASE_PROJECTLESS_READ_TOOLS.has(mcpToolName) &&
    toolInput.project_id === undefined
  ) {
    return claudeResponse(
      "ask",
      `Read-only Supabase metadata tool (${mcpToolName}) deferred to permission prompt.`,
    );
  }

  const classification = classifyProjectRef(toolInput.project_id);
  if (SUPABASE_PROJECT_READ_TOOLS.has(mcpToolName)) {
    return claudeResponse(
      "ask",
      `Read-only Supabase MCP tool (${mcpToolName}) targeting ${classification.kind} (${formatRefForMessage(classification.projectId)}) requires confirmation.`,
    );
  }

  if (classification.kind === "staging") {
    return claudeResponse(
      "ask",
      `Mutating Supabase MCP tool (${mcpToolName}) targets staging (${classification.projectId}); confirm before running.`,
    );
  }

  return claudeResponse(
    "deny",
    `Blocked mutating/unclassified Supabase MCP tool (${mcpToolName}) targeting ${classification.kind} (${formatRefForMessage(classification.projectId)}).`,
  );
}

function evaluateClaudePayload(payload) {
  if (!isPlainObject(payload.tool_input)) {
    return claudeResponse(
      "deny",
      "Supabase migration guard blocked payload with missing or invalid tool_input (fail-closed).",
    );
  }

  const toolName = payload.tool_name;
  if (toolName === "Bash") {
    return evaluateBashCommandForSupabase(payload.tool_input.command);
  }

  if (toolName === undefined) {
    return evaluateClaudeSupabaseTool("apply_migration", payload.tool_input);
  }

  if (typeof toolName !== "string") {
    return claudeResponse(
      "deny",
      "Supabase migration guard blocked payload with invalid tool_name (fail-closed).",
    );
  }

  const lower = toolName.trim().toLowerCase();
  const match = lower.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (!match) {
    return claudeResponse(
      "deny",
      `Supabase migration guard blocked unexpected tool_name ('${toolName}').`,
    );
  }

  const [, serverName, mcpToolName] = match;
  if (!isSupabaseServerName(serverName)) {
    return {};
  }

  return evaluateClaudeSupabaseTool(mcpToolName, payload.tool_input);
}

function decideAntigravityMigration(classification) {
  switch (classification.kind) {
    case "staging":
      return antigravityResponse(
        "allow",
        `apply_migration on staging (${classification.projectId}) is permitted without a prompt.`,
      );
    case "production":
      return antigravityResponse(
        "deny",
        `Blocked MCP apply_migration against production (${classification.projectId}). Production migrations must use the target-verified production workflow, not MCP.`,
      );
    case "missing":
      return antigravityResponse(
        "deny",
        "Blocked MCP apply_migration because project_id is missing or invalid (fail-closed).",
      );
    default:
      return antigravityResponse(
        "deny",
        `Blocked MCP apply_migration against unrecognised project_id ('${formatRefForMessage(classification.projectId)}'); only staging (${STAGING_PROJECT_REF}) is permitted.`,
      );
  }
}

function evaluateAntigravitySupabaseTool(mcpToolName, mcpArgs) {
  if (isApplyMigrationToolName(mcpToolName)) {
    return decideAntigravityMigration(classifyProjectRef(mcpArgs.project_id));
  }

  if (
    SUPABASE_PROJECTLESS_READ_TOOLS.has(mcpToolName) &&
    mcpArgs.project_id === undefined
  ) {
    return antigravityResponse(
      "ask",
      `Read-only Supabase metadata tool (${mcpToolName}) deferred to Antigravity permission settings.`,
    );
  }

  const classification = classifyProjectRef(mcpArgs.project_id);
  if (SUPABASE_PROJECT_READ_TOOLS.has(mcpToolName)) {
    if (classification.kind === "staging") {
      return antigravityResponse(
        "ask",
        `Read-only Supabase MCP tool (${mcpToolName}) targets staging (${classification.projectId}); deferred to Antigravity permission settings.`,
      );
    }
    return antigravityResponse(
      "force_ask",
      `Read-only Supabase MCP tool (${mcpToolName}) targets ${classification.kind} (${formatRefForMessage(classification.projectId)}); per-call human confirmation required.`,
    );
  }

  if (classification.kind === "staging") {
    return antigravityResponse(
      "ask",
      `Supabase MCP tool ${mcpToolName} targets staging (${classification.projectId}); deferred to Antigravity permission settings.`,
    );
  }

  return antigravityResponse(
    "deny",
    `Blocked mutating/unclassified Supabase MCP tool (${mcpToolName}) targeting ${classification.kind} (${formatRefForMessage(classification.projectId)}).`,
  );
}

function evaluateAntigravityPayload(payload) {
  if (!isPlainObject(payload.toolCall) || typeof payload.toolCall.name !== "string") {
    return antigravityResponse(
      "deny",
      "Supabase migration guard blocked malformed PreToolUse payload (missing toolCall).",
    );
  }

  const toolName = payload.toolCall.name;
  const rawArgs = payload.toolCall.args;
  if (rawArgs !== undefined && !isPlainObject(rawArgs)) {
    return antigravityResponse(
      "deny",
      "Supabase migration guard blocked malformed toolCall.args (expected object).",
    );
  }
  const argsObj = rawArgs ?? {};

  if (toolName === "call_mcp_tool") {
    const serverName =
      typeof argsObj.ServerName === "string"
        ? argsObj.ServerName.trim().toLowerCase()
        : "";
    const mcpToolName =
      typeof argsObj.ToolName === "string"
        ? argsObj.ToolName.trim().toLowerCase()
        : "";

    if (!serverName || !mcpToolName) {
      return antigravityResponse(
        "deny",
        "Supabase migration guard blocked malformed call_mcp_tool payload (missing ServerName or ToolName).",
      );
    }

    const isSupabase = isSupabaseServerName(serverName);
    const isMigration = isApplyMigrationToolName(mcpToolName);

    if (!isSupabase && !isMigration) {
      return antigravityResponse(
        "ask",
        `Non-Supabase MCP call (${serverName}/${mcpToolName}) deferred to Antigravity permission settings.`,
      );
    }

    const parsedArgs = parseArgumentsObject(argsObj.Arguments);
    if (!parsedArgs.ok) {
      return antigravityResponse(
        "deny",
        `Supabase migration guard blocked unreadable Arguments (${parsedArgs.error}).`,
      );
    }
    return evaluateAntigravitySupabaseTool(mcpToolName, parsedArgs.value);
  }

  if (isApplyMigrationToolName(toolName.toLowerCase())) {
    const nestedArgs = parseArgumentsObject(argsObj.Arguments);
    if (!nestedArgs.ok) {
      return antigravityResponse(
        "deny",
        `Supabase migration guard blocked unreadable Arguments (${nestedArgs.error}).`,
      );
    }
    const projectId =
      argsObj.project_id !== undefined
        ? argsObj.project_id
        : nestedArgs.value.project_id;
    return decideAntigravityMigration(classifyProjectRef(projectId));
  }

  return antigravityResponse(
    "ask",
    `Non-migration tool (${toolName}) deferred to Antigravity permission settings.`,
  );
}

/**
 * Evaluates raw hook stdin JSON for the requested agent (`claude`, `codex`, or `antigravity`).
 * Always returns a fail-closed decision object and never throws.
 */
export function evaluateMigrationGuard(rawInput, agent) {
  if (agent !== "claude" && agent !== "codex" && agent !== "antigravity") {
    return antigravityResponse(
      "deny",
      `Supabase migration guard blocked call for unsupported agent mode ('${String(agent ?? "")}').`,
    );
  }

  const isClaudeLike = agent === "claude" || agent === "codex";
  const parsed = parseJsonObject(rawInput);
  if (!parsed.ok) {
    return isClaudeLike
      ? claudeResponse(
          "deny",
          `Supabase migration guard blocked unreadable hook payload (${parsed.error}).`,
        )
      : antigravityResponse(
          "deny",
          `Supabase migration guard blocked unreadable hook payload (${parsed.error}).`,
        );
  }

  return isClaudeLike
    ? evaluateClaudePayload(parsed.value)
    : evaluateAntigravityPayload(parsed.value);
}

function resolveAgentArg(argv) {
  const index = argv.indexOf("--agent");
  if (index === -1) return "";
  return argv[index + 1] ?? "";
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (entryFile === currentFile) {
  const agent = resolveAgentArg(process.argv.slice(2));
  try {
    const raw = readFileSync(0, "utf8");
    const result = evaluateMigrationGuard(raw, agent);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected guard error";
    const fallback =
      agent === "claude" || agent === "codex"
        ? claudeResponse(
            "deny",
            `Supabase migration guard failed closed (${message}).`,
          )
        : antigravityResponse(
            "deny",
            `Supabase migration guard failed closed (${message}).`,
          );
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
  }
}
