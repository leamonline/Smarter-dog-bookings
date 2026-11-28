#!/usr/bin/env node
// Shared fail-closed Supabase MCP migration guard for Claude Code and Antigravity.
//
// Keeps canonical project refs and target-classification rules in one place so
// agent-specific hook configurations stay thin compatibility layers:
// - Staging (`btjnxvgkpdbfrrqxvkfj`) is the only hosted development target
//   permitted without a prompt for `apply_migration`.
// - Production (`nlzhllhkigmsvrzduefz`), missing project_id, unknown targets and
//   malformed payloads fail closed (`deny` in Antigravity `apply_migration`,
//   `ask` in Claude Code where `permissions.allow` omits `apply_migration`).

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

function parseAntigravityArguments(rawArgs) {
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

function evaluateClaudePayload(payload) {
  if (
    payload.tool_name !== undefined &&
    payload.tool_name !== "mcp__Supabase__apply_migration"
  ) {
    return claudeResponse(
      "ask",
      "apply_migration guard: unexpected Claude tool name; confirm by hand.",
    );
  }
  if (!isPlainObject(payload.tool_input)) {
    return claudeResponse(
      "ask",
      "apply_migration guard: missing or invalid tool_input; confirm by hand.",
    );
  }

  const classification = classifyProjectRef(payload.tool_input.project_id);
  switch (classification.kind) {
    case "staging":
      return claudeResponse(
        "allow",
        `apply_migration on staging (${classification.projectId}) is allowed without a prompt.`,
      );
    case "production":
      return claudeResponse(
        "ask",
        `apply_migration targets PRODUCTION (${classification.projectId}): a human must confirm this call; the repository grants no standing production authority.`,
      );
    case "missing":
      return claudeResponse(
        "ask",
        "apply_migration guard: missing or invalid project_id; confirm by hand.",
      );
    default:
      return claudeResponse(
        "ask",
        `apply_migration targets an unrecognised project ref ('${formatRefForMessage(classification.projectId)}'): confirm by hand.`,
      );
  }
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

    const parsedArgs = parseAntigravityArguments(argsObj.Arguments);
    if (!parsedArgs.ok) {
      return antigravityResponse(
        "deny",
        `Supabase migration guard blocked unreadable Arguments (${parsedArgs.error}).`,
      );
    }
    const mcpArgs = parsedArgs.value;

    if (isMigration) {
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
    if (classification.kind === "staging") {
      return antigravityResponse(
        "ask",
        `Supabase MCP tool ${mcpToolName} targets staging (${classification.projectId}); deferred to Antigravity permission settings.`,
      );
    }
    return antigravityResponse(
      "force_ask",
      `Supabase MCP tool ${mcpToolName} targets ${classification.kind} (${formatRefForMessage(classification.projectId)}); per-call human confirmation required.`,
    );
  }

  if (isApplyMigrationToolName(toolName.toLowerCase())) {
    const nestedArgs = parseAntigravityArguments(argsObj.Arguments);
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
 * Evaluates raw hook stdin JSON for the requested agent (`claude` or `antigravity`).
 * Always returns a fail-closed decision object and never throws.
 */
export function evaluateMigrationGuard(rawInput, agent) {
  if (agent !== "claude" && agent !== "antigravity") {
    return antigravityResponse(
      "deny",
      `Supabase migration guard blocked call for unsupported agent mode ('${String(agent ?? "")}').`,
    );
  }

  const parsed = parseJsonObject(rawInput);
  if (!parsed.ok) {
    return agent === "claude"
      ? claudeResponse(
          "ask",
          `apply_migration guard: unreadable hook payload (${parsed.error}); confirm by hand.`,
        )
      : antigravityResponse(
          "deny",
          `Supabase migration guard blocked unreadable hook payload (${parsed.error}).`,
        );
  }

  return agent === "claude"
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
      agent === "claude"
        ? claudeResponse(
            "ask",
            `apply_migration guard: unexpected error (${message}); confirm by hand.`,
          )
        : antigravityResponse(
            "deny",
            `Supabase migration guard failed closed (${message}).`,
          );
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
  }
}
