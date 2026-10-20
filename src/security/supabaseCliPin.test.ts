import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #992: every workflow installs the same pinned Supabase CLI, and the Edge
// Function deploy loop tries every changed function before failing.
const root = join(__dirname, "..", "..");
const workflowsDir = join(root, ".github", "workflows");
const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml"))
  .map((name) => ({ name, text: readFileSync(join(workflowsDir, name), "utf8") }));

describe("Supabase CLI pin", () => {
  it("installs one pinned version everywhere, never latest", () => {
    const versions = new Map<string, string>();
    for (const { name, text } of workflows) {
      for (const match of text.matchAll(/uses: supabase\/setup-cli@\S+\s+with:\s+(?:#[^\n]*\n\s+)*version: (\S+)/g)) {
        versions.set(`${name}@${match.index}`, match[1]);
      }
    }
    expect(versions.size).toBeGreaterThanOrEqual(4);
    const distinct = new Set(versions.values());
    expect([...distinct]).toHaveLength(1);
    expect([...distinct][0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has no setup-cli step without a version", () => {
    for (const { name, text } of workflows) {
      const uses = text.match(/uses: supabase\/setup-cli@/g)?.length ?? 0;
      const pinned = text.match(/uses: supabase\/setup-cli@\S+\s+with:\s+(?:#[^\n]*\n\s+)*version: \d/g)?.length ?? 0;
      expect(pinned, name).toBe(uses);
    }
  });
});

describe("Edge Function deploy loop", () => {
  const text = workflows.find((w) => w.name === "deploy-edge-functions.yml")!.text;
  const step = text.slice(text.indexOf("- name: Deploy changed functions"));
  const script = step
    .slice(step.indexOf("run: |") + "run: |".length)
    .split("\n")
    .slice(1)
    .filter((_line, index, lines) => {
      // The block ends at the first line indented less than the script body.
      const end = lines.findIndex((l) => l.trim() !== "" && !l.startsWith("          "));
      return end === -1 || index < end;
    })
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");

  it("deploys every function after a failure and names each one that failed", () => {
    // A stub `supabase` that fails for one function name only.
    const dir = mkdtempSync(join(tmpdir(), "deploy-loop-"));
    const stub = join(dir, "supabase");
    writeFileSync(stub, '#!/bin/bash\n[ "$3" = "broken-fn" ] && exit 1\necho "stub deployed $3" >> "$LOG"\n');
    chmodSync(stub, 0o755);
    const log = join(dir, "log");
    writeFileSync(log, "");
    let status = 0;
    let output: string;
    try {
      output = execFileSync("bash", ["-c", script], {
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          LOG: log,
          SUPABASE_ACCESS_TOKEN: "test-only",
          SUPABASE_PROJECT_REF: "test-ref",
          CHANGED_FUNCTIONS: "first-fn\nbroken-fn\nlast-fn",
        },
        encoding: "utf8",
      });
    } catch (err) {
      const failure = err as { status: number; stdout: string };
      status = failure.status;
      output = failure.stdout;
    }
    expect(status).toBe(1);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["stub deployed first-fn", "stub deployed last-fn"]);
    expect(output).toContain("::error::Not deployed: broken-fn");
  });

  it("bundles server-side, so a deploy never pulls the Docker bundler image", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-args-"));
    const stub = join(dir, "supabase");
    writeFileSync(stub, '#!/bin/bash\necho "$*" >> "$LOG"\n');
    chmodSync(stub, 0o755);
    const log = join(dir, "log");
    writeFileSync(log, "");
    execFileSync("bash", ["-c", script], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        LOG: log,
        SUPABASE_ACCESS_TOKEN: "test-only",
        SUPABASE_PROJECT_REF: "test-ref",
        CHANGED_FUNCTIONS: "only-fn",
      },
      encoding: "utf8",
    });
    expect(readFileSync(log, "utf8").trim()).toBe("functions deploy only-fn --project-ref test-ref --no-verify-jwt --use-api");
  });

  it("skips a function directory that the pushed range deleted", () => {
    const detect = text.slice(text.indexOf("- name: Work out which functions changed"), text.indexOf("- name: Install Supabase CLI"));
    expect(detect).toMatch(/if \[ -d "supabase\/functions\/\$f" \]/);
  });

  it("redeploys every function when the deploy workflow itself changes", () => {
    const detect = text.slice(text.indexOf("- name: Work out which functions changed"), text.indexOf("- name: Install Supabase CLI"));
    expect(detect).toContain("-- '.github/workflows/deploy-edge-functions.yml'");
    expect(detect).toMatch(/if \[ -n "\$workflow_changed" \] \|\|/);
  });

  it("reads the function list from the environment, not the script text", () => {
    expect(script).not.toContain("${{");
  });
});
