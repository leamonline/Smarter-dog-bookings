// The advisor baseline check (assessment item 2.6): the pure diff the
// script decides with, and the shape of the committed baseline file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADVISOR_TYPES,
  DEFAULT_BASELINE_PATH,
  buildBaseline,
  diffAdvisors,
  formatReport,
  hasNewFindings,
  normaliseLints,
} from "../../scripts/check-advisors.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const lint = (cache_key: string, level = "WARN", name = "rls_enabled_no_policy", detail = "") => ({
  cache_key,
  name,
  level,
  detail,
  title: "ignored",
  remediation: "https://example.test",
});

describe("normaliseLints", () => {
  it("keeps only the stable fields and sorts by cache_key", () => {
    expect(normaliseLints([lint("b"), lint("a", "INFO", "unused_index", "x")])).toEqual([
      { cache_key: "a", name: "unused_index", level: "INFO", detail: "x" },
      { cache_key: "b", name: "rls_enabled_no_policy", level: "WARN", detail: "" },
    ]);
    expect(normaliseLints(undefined)).toEqual([]);
    expect(normaliseLints([{ name: "no key" }])).toEqual([]);
  });
});

describe("diffAdvisors", () => {
  const baseline = [lint("keep"), lint("gone"), lint("levels", "INFO")];

  it("reports a live finding missing from the baseline as new", () => {
    const diff = diffAdvisors(baseline, [lint("keep"), lint("gone"), lint("levels", "INFO"), lint("brand-new")]);
    expect(diff.added.map((e) => e.cache_key)).toEqual(["brand-new"]);
    expect(diff.resolved).toEqual([]);
    expect(hasNewFindings(diff)).toBe(true);
  });

  it("reports an escalated level as new and a missing baseline entry as resolved", () => {
    const diff = diffAdvisors(baseline, [lint("keep"), lint("levels", "WARN")]);
    expect(diff.added).toEqual([]);
    expect(diff.relevelled).toEqual([
      { cache_key: "levels", name: "rls_enabled_no_policy", from: "INFO", to: "WARN" },
    ]);
    expect(diff.resolved.map((e) => e.cache_key)).toEqual(["gone"]);
    expect(hasNewFindings(diff)).toBe(true);
  });

  it("is clean when live matches the baseline exactly, and resolved-only does not fail", () => {
    expect(hasNewFindings(diffAdvisors(baseline, baseline))).toBe(false);
    const resolvedOnly = diffAdvisors(baseline, [lint("keep"), lint("levels", "INFO")]);
    expect(hasNewFindings(resolvedOnly)).toBe(false);
    expect(resolvedOnly.resolved.map((e) => e.cache_key)).toEqual(["gone"]);
  });
});

describe("formatReport", () => {
  it("names the status per type and lists what changed", () => {
    const report = formatReport({
      security: diffAdvisors([lint("a")], [lint("a"), lint("b", "WARN", "auth_leaked_password_protection", "turn it on")]),
      performance: diffAdvisors([lint("z", "INFO", "unused_index")], []),
    });
    expect(report).toContain("security: NEW FINDINGS");
    expect(report).toContain("+ WARN  auth_leaked_password_protection  b");
    expect(report).toContain("turn it on");
    expect(report).toContain("performance: resolved only");
    expect(report).toContain("- resolved: 1 × unused_index");
  });
});

describe("the committed baseline", () => {
  const baseline = JSON.parse(readFileSync(path.join(repoRoot, DEFAULT_BASELINE_PATH), "utf8"));

  it("names the hosted project and records both advisor types", () => {
    expect(baseline.project_ref).toMatch(/^[a-z]{20}$/);
    expect(baseline.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const type of ADVISOR_TYPES) expect(Array.isArray(baseline[type])).toBe(true);
  });

  it("is normalised: unique cache keys, sorted, only the recorded fields", () => {
    for (const type of ADVISOR_TYPES) {
      const entries = baseline[type];
      expect(normaliseLints(entries)).toEqual(entries);
      expect(new Set(entries.map((e: { cache_key: string }) => e.cache_key)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(Object.keys(entry).sort()).toEqual(["cache_key", "detail", "level", "name"]);
      }
    }
  });

  it("round-trips through buildBaseline unchanged", () => {
    const rebuilt = buildBaseline({
      projectRef: baseline.project_ref,
      recordedAt: baseline.recorded_at,
      liveByType: { security: baseline.security, performance: baseline.performance },
      previous: baseline,
    });
    expect(rebuilt).toEqual(baseline);
  });
});
