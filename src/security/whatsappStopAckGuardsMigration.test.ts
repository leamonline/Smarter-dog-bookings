// The STOP acknowledgement guards (migration 20261017120000, #1026 review
// follow-up) must stay expand-only: they add a trigger and an index and change
// no function, table or row that is already live. The behaviour itself is
// proven against real PostgreSQL by supabase/tests/250.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261017120000_whatsapp_stop_ack_guards.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8");
// Executable SQL only, so the explanatory header cannot satisfy or trip a check.
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("WhatsApp STOP acknowledgement guards migration", () => {
  it("is expand-only: nothing is dropped, altered, deleted or rewritten", () => {
    expect(code).not.toMatch(/\bdrop\s+(table|column|function|trigger|index|policy)\b/i);
    expect(code).not.toMatch(/\balter\s+table\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/\bupdate\s+public\./i);
  });

  it("leaves apply_whatsapp_stop and the re-enable path untouched", () => {
    expect(code).not.toMatch(/apply_whatsapp_stop/);
    expect(code).not.toMatch(/staff_reenable_whatsapp_number/);
    expect(code).not.toMatch(/humans_guard_whatsapp_reenable/);
  });

  it("is idempotent", () => {
    expect(code).toMatch(/create or replace function public\.whatsapp_drafts_guard_stop_ack\(\)/i);
    expect(code).toMatch(/create or replace trigger trg_whatsapp_drafts_guard_stop_ack/i);
    expect(code).toMatch(/create unique index if not exists whatsapp_drafts_one_opt_out_ack_per_stop/i);
  });

  it("checks the conversation under a share lock, so it is atomic with a re-enable", () => {
    expect(code).toMatch(/where c\.id = new\.conversation_id\s+for share;/i);
    // KEY SHARE would not conflict with the re-enable's FOR NO KEY UPDATE.
    expect(code).not.toMatch(/for key share/i);
    expect(code).toMatch(/before insert on public\.whatsapp_drafts/i);
  });

  it("only guards acknowledgement drafts, and refuses with a stable code", () => {
    expect(code).toMatch(/\(new\.tool_calls ->> 'opt_out_acknowledgement'\) is distinct from 'true'\s+then\s+return new/i);
    expect(code).toMatch(/errcode = 'P0001'/);
    expect(code).toMatch(/whatsapp_stop_ack_not_stopped/);
  });

  it("is a definer function with a pinned search_path that clients cannot call", () => {
    expect(code).toMatch(/security definer\s+set search_path = public, pg_temp/i);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(code).toMatch(
        new RegExp(`revoke all on function public\\.whatsapp_drafts_guard_stop_ack\\(\\) from ${role};`, "i"),
      );
    }
  });

  it("keeps the per-STOP index partial, so existing rows cannot violate it", () => {
    const index = code.slice(code.indexOf("create unique index"));
    expect(index).toMatch(/\(conversation_id, \(tool_calls ->> 'stop_meta_message_id'\)\)/);
    expect(index).toMatch(/\(tool_calls ->> 'opt_out_acknowledgement'\) = 'true'/);
    expect(index).toMatch(/\(tool_calls ->> 'stop_meta_message_id'\) is not null/);
  });

  it("sets a lock timeout so a blocked apply fails fast instead of queueing", () => {
    expect(code).toMatch(/set local lock_timeout = '5s';/);
  });
});
