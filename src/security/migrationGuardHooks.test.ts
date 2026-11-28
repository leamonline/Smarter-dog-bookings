import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  classifyProjectRef,
  evaluateMigrationGuard,
} from "../../scripts/guard-supabase-migration.mjs";

const root = process.cwd();
const sharedGuardPath = join(root, "scripts/guard-supabase-migration.mjs");
const sharedLauncherPath = join(root, "scripts/guard-supabase-hook.sh");
const antigravityHooksPath = join(root, ".agents/hooks.json");
const claudeGuardPath = join(root, ".claude/hooks/guard-supabase-apply-migration.sh");
const claudeSettingsPath = join(root, ".claude/settings.json");
const mcpConfigPath = join(root, ".mcp.json");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runSharedGuard(agent: string, stdin: string, cwd = root) {
  return spawnSync(process.execPath, [sharedGuardPath, "--agent", agent], {
    cwd,
    input: stdin,
    encoding: "utf8",
  });
}

function runClaudeAdapter(stdin: string, envOverride?: NodeJS.ProcessEnv) {
  return spawnSync("bash", [claudeGuardPath], {
    cwd: root,
    input: stdin,
    encoding: "utf8",
    env: envOverride ?? process.env,
  });
}

function evalAntigravity(stdin: string): { decision: string; reason: string } {
  const result = evaluateMigrationGuard(stdin, "antigravity");
  if (
    !("decision" in result) ||
    typeof result.decision !== "string" ||
    !("reason" in result) ||
    typeof result.reason !== "string"
  ) {
    throw new Error("Expected Antigravity decision shape");
  }
  return { decision: result.decision, reason: result.reason };
}

function evalClaude(stdin: string, agent: "claude" | "codex" = "claude"): string {
  const result = evaluateMigrationGuard(stdin, agent) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  return result.hookSpecificOutput?.permissionDecision ?? "none";
}

function antigravityCallMcpPayload(
  serverName: unknown,
  toolName: unknown,
  argumentsPayload: unknown,
) {
  return JSON.stringify({
    hookEventName: "PreToolUse",
    cwd: root,
    toolCall: {
      id: "toolu_test",
      name: "call_mcp_tool",
      args: {
        ServerName: serverName,
        ToolName: toolName,
        Arguments: argumentsPayload,
      },
    },
  });
}

describe("cross-agent Supabase migration guard", () => {
  it("tracks .agents/hooks.json, enforces fail-closed Claude settings and keeps .mcp.json read-only", () => {
    const tracked = execFileSync("git", ["ls-files", ".agents/hooks.json"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe(".agents/hooks.json");

    const hooksConfig = JSON.parse(readFileSync(antigravityHooksPath, "utf8"));
    const guardHook = hooksConfig["supabase-migration-guard"];
    expect(guardHook).toBeDefined();
    expect(Array.isArray(guardHook.PreToolUse)).toBe(true);
    expect(guardHook.PreToolUse).toHaveLength(1);

    const entry = guardHook.PreToolUse[0];
    expect(entry.matcher).toBe("call_mcp_tool|.*apply_migration.*");
    expect(entry.hooks).toEqual([
      {
        type: "command",
        command: "../scripts/guard-supabase-hook.sh antigravity",
        timeout: 10,
      },
    ]);

    const commandParts = entry.hooks[0].command.split(" ");
    const resolvedTarget = resolve(dirname(antigravityHooksPath), commandParts[0]);
    expect(resolvedTarget).toBe(sharedLauncherPath);
    expect(statSync(sharedLauncherPath).mode & 0o111).not.toBe(0);
    expect(statSync(sharedGuardPath).mode & 0o111).not.toBe(0);
    expect(statSync(claudeGuardPath).mode & 0o111).not.toBe(0);

    const claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, "utf8"));
    expect(claudeSettings.permissions).toBeUndefined();
    const claudePre = claudeSettings.hooks.PreToolUse[0];
    expect(claudePre.matcher).toBe("mcp__Supabase__.*|Bash");
    expect(claudePre.hooks[0].onFailure).toBe("block");

    const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf8"));
    const supabaseUrl = new URL(mcpConfig.mcpServers.supabase.url);
    expect(supabaseUrl.searchParams.get("read_only")).toBe("true");
  });

  it("classifies project refs strictly without trimming, case folding or substring matching", () => {
    expect(classifyProjectRef(STAGING_PROJECT_REF)).toEqual({
      kind: "staging",
      projectId: STAGING_PROJECT_REF,
    });
    expect(classifyProjectRef(PRODUCTION_PROJECT_REF)).toEqual({
      kind: "production",
      projectId: PRODUCTION_PROJECT_REF,
    });

    for (const missing of [undefined, null, "", 123, {}, []]) {
      expect(classifyProjectRef(missing).kind).toBe("missing");
    }

    for (const unknown of [
      ` ${STAGING_PROJECT_REF}`,
      `${STAGING_PROJECT_REF} `,
      STAGING_PROJECT_REF.toUpperCase(),
      `https://${STAGING_PROJECT_REF}.supabase.co`,
      `${STAGING_PROJECT_REF}-clone`,
      "arbitrary-unknown-ref",
    ]) {
      expect(classifyProjectRef(unknown).kind).toBe("unknown");
    }
  });

  it("permits Antigravity apply_migration only for staging and denies production, missing, unknown, mutating and malformed inputs", () => {
    const stagingCall = antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
      project_id: STAGING_PROJECT_REF,
      name: "test_migration",
      query: "select 1;",
    });
    const stagingResult = runSharedGuard(
      "antigravity",
      stagingCall,
      dirname(antigravityHooksPath),
    );
    expect(stagingResult.status).toBe(0);
    expect(JSON.parse(stagingResult.stdout).decision).toBe("allow");

    const stringArgsStaging = antigravityCallMcpPayload(
      "supabase_mcp",
      "apply_migration",
      JSON.stringify({ project_id: STAGING_PROJECT_REF, name: "m", query: "select 1;" }),
    );
    expect(evalAntigravity(stringArgsStaging).decision).toBe("allow");

    const directStaging = JSON.stringify({
      hookEventName: "PreToolUse",
      toolCall: {
        name: "apply_migration",
        args: { project_id: STAGING_PROJECT_REF },
      },
    });
    expect(evalAntigravity(directStaging).decision).toBe("allow");

    const deniedCases = [
      [
        "production via call_mcp_tool",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          project_id: PRODUCTION_PROJECT_REF,
          name: "prod_attempt",
          query: "select 1;",
        }),
      ],
      [
        "production via string Arguments",
        antigravityCallMcpPayload(
          "supabase_mcp",
          "apply_migration",
          JSON.stringify({ project_id: PRODUCTION_PROJECT_REF }),
        ),
      ],
      [
        "production via direct apply_migration tool name",
        JSON.stringify({
          hookEventName: "PreToolUse",
          toolCall: {
            name: "supabase_mcp__apply_migration",
            args: { project_id: PRODUCTION_PROJECT_REF },
          },
        }),
      ],
      [
        "production execute_sql",
        antigravityCallMcpPayload("supabase_mcp", "execute_sql", {
          project_id: PRODUCTION_PROJECT_REF,
          query: "drop table bookings;",
        }),
      ],
      [
        "production deploy_edge_function",
        antigravityCallMcpPayload("supabase_mcp", "deploy_edge_function", {
          project_id: PRODUCTION_PROJECT_REF,
          name: "fn",
        }),
      ],
      [
        "unknown deploy_edge_function",
        antigravityCallMcpPayload("supabase_mcp", "deploy_edge_function", {
          project_id: "unknown-ref",
          name: "fn",
        }),
      ],
      [
        "missing project_id on apply_migration",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          name: "missing_ref",
          query: "select 1;",
        }),
      ],
      [
        "missing project_id on execute_sql",
        antigravityCallMcpPayload("supabase_mcp", "execute_sql", {
          query: "select 1;",
        }),
      ],
      [
        "empty project_id",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          project_id: "",
        }),
      ],
      [
        "whitespace-padded staging project_id",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          project_id: ` ${STAGING_PROJECT_REF} `,
        }),
      ],
      [
        "unknown project_id",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          project_id: "unrecognised-project",
        }),
      ],
      [
        "unparseable Arguments string",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", "{not-json"),
      ],
      [
        "non-object Arguments",
        antigravityCallMcpPayload("supabase_mcp", "apply_migration", ["bad"]),
      ],
      [
        "missing ServerName",
        antigravityCallMcpPayload("", "apply_migration", {
          project_id: STAGING_PROJECT_REF,
        }),
      ],
      ["malformed top-level JSON", "{broken"],
      ["empty stdin", ""],
      ["JSON array top-level", "[]"],
      ["missing toolCall", JSON.stringify({ hookEventName: "PreToolUse" })],
      [
        "non-object toolCall.args",
        JSON.stringify({
          hookEventName: "PreToolUse",
          toolCall: { name: "call_mcp_tool", args: "bad" },
        }),
      ],
    ];

    for (const [label, payload] of deniedCases) {
      const cli = runSharedGuard("antigravity", payload);
      expect(cli.status, label).toBe(0);
      const parsed = JSON.parse(cli.stdout);
      expect(parsed.decision, label).toBe("deny");
      expect(typeof parsed.reason, label).toBe("string");
    }
  });

  it("forces per-call confirmation for read-only supabase_mcp calls on production or unknown targets without breaking other MCP tools", () => {
    const prodTables = antigravityCallMcpPayload("supabase_mcp", "list_tables", {
      project_id: PRODUCTION_PROJECT_REF,
    });
    expect(evalAntigravity(prodTables).decision).toBe("force_ask");

    const stagingSql = antigravityCallMcpPayload("supabase_mcp", "execute_sql", {
      project_id: STAGING_PROJECT_REF,
      query: "select 1;",
    });
    expect(evalAntigravity(stagingSql).decision).toBe("ask");

    const listProjects = antigravityCallMcpPayload("supabase_mcp", "list_projects", {});
    expect(evalAntigravity(listProjects).decision).toBe("ask");

    const unrelatedMcp = antigravityCallMcpPayload("context7_context7", "query-docs", {
      libraryId: "/vercel/ai",
      query: "streaming",
    });
    expect(evalAntigravity(unrelatedMcp).decision).toBe("ask");
  });

  it("enforces fail-closed deny on Claude/Codex adapters for prohibited MCP and shell mutations and fallback failures", () => {
    const staging = JSON.stringify({
      tool_name: "mcp__Supabase__apply_migration",
      tool_input: { project_id: STAGING_PROJECT_REF, name: "m", query: "select 1;" },
    });
    const stagingOut = runClaudeAdapter(staging);
    expect(stagingOut.status).toBe(0);
    expect(JSON.parse(stagingOut.stdout).hookSpecificOutput.permissionDecision).toBe(
      "allow",
    );
    expect(evalClaude(staging, "codex")).toBe("allow");

    const deniedPayloads = [
      JSON.stringify({
        tool_name: "mcp__Supabase__apply_migration",
        tool_input: { project_id: PRODUCTION_PROJECT_REF, name: "m", query: "select 1;" },
      }),
      JSON.stringify({
        tool_name: "mcp__Supabase__execute_sql",
        tool_input: { project_id: PRODUCTION_PROJECT_REF, query: "drop table bookings;" },
      }),
      JSON.stringify({
        tool_name: "mcp__Supabase__deploy_edge_function",
        tool_input: { project_id: PRODUCTION_PROJECT_REF, name: "fn" },
      }),
      JSON.stringify({
        tool_name: "mcp__Supabase__apply_migration",
        tool_input: {},
      }),
      JSON.stringify({
        tool_name: "mcp__Supabase__apply_migration",
        tool_input: { project_id: "unknown-ref" },
      }),
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "supabase db push --linked" },
      }),
      JSON.stringify({
        tool_name: "Bash",
        tool_input: {
          command: `supabase functions deploy whatsapp-agent --project-ref ${PRODUCTION_PROJECT_REF}`,
        },
      }),
      JSON.stringify({
        tool_name: "Bash",
        tool_input: {
          command: `curl -X POST https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`,
        },
      }),
      "{malformed-json",
      "",
    ];

    for (const payload of deniedPayloads) {
      const out = runClaudeAdapter(payload);
      expect(out.status, payload).toBe(0);
      expect(
        JSON.parse(out.stdout).hookSpecificOutput.permissionDecision,
        payload,
      ).toBe("deny");
    }

    // Normal shell commands and search commands must pass through cleanly without override.
    expect(
      evaluateMigrationGuard(
        JSON.stringify({ tool_name: "Bash", tool_input: { command: "npm run test" } }),
        "claude",
      ),
    ).toEqual({});
    expect(
      evaluateMigrationGuard(
        JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: "git grep api.supabase.com/v1/projects/" },
        }),
        "claude",
      ),
    ).toEqual({});

    // Simulate a failing `node` binary on PATH and a missing shared script: both must fail closed (`deny`).
    const isolatedDir = mkdtempSync(join(tmpdir(), "guard-fail-closed-"));
    tempDirs.push(isolatedDir);
    const fakeNode = join(isolatedDir, "node");
    writeFileSync(fakeNode, "#!/usr/bin/env bash\nexit 1\n", { mode: 0o755 });

    const failingNodeClaude = runClaudeAdapter(staging, {
      PATH: `${isolatedDir}:/bin:/usr/bin`,
      HOME: isolatedDir,
    });
    expect(failingNodeClaude.status).toBe(0);
    expect(
      JSON.parse(failingNodeClaude.stdout).hookSpecificOutput.permissionDecision,
    ).toBe("deny");

    const failingNodeAntigravity = spawnSync(
      "bash",
      [sharedLauncherPath, "antigravity"],
      {
        cwd: dirname(antigravityHooksPath),
        input: antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
          project_id: STAGING_PROJECT_REF,
        }),
        encoding: "utf8",
        env: { PATH: `${isolatedDir}:/bin:/usr/bin`, HOME: isolatedDir },
      },
    );
    expect(failingNodeAntigravity.status).toBe(0);
    expect(JSON.parse(failingNodeAntigravity.stdout).decision).toBe("deny");

    const isolatedLauncher = join(isolatedDir, "guard-supabase-hook.sh");
    copyFileSync(sharedLauncherPath, isolatedLauncher);
    const missingGuardOut = spawnSync("bash", [isolatedLauncher, "antigravity"], {
      cwd: isolatedDir,
      input: antigravityCallMcpPayload("supabase_mcp", "apply_migration", {
        project_id: STAGING_PROJECT_REF,
      }),
      encoding: "utf8",
    });
    expect(missingGuardOut.status).toBe(0);
    expect(JSON.parse(missingGuardOut.stdout).decision).toBe("deny");

    const unsupportedAgent = runSharedGuard("unknown-agent", staging);
    expect(unsupportedAgent.status).toBe(0);
    expect(JSON.parse(unsupportedAgent.stdout).decision).toBe("deny");
  });
});
