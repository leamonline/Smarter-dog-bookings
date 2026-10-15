// The WhatsApp re-enable contract: what the two functions in migration
// 20261014120000 RAISE and TAKE must equal what the app CLASSIFIES and SENDS.
//
// Modelled on denialCodeContract.test.ts. The dialog's copy hangs off
// classifyReenableError; a DETAIL code the classifier does not know falls
// through to "unknown" and tells staff "nothing was changed, give it another
// go" for a refusal that has a specific, fixable reason. And a wrapper that
// misnames an argument fails every call at runtime with PGRST202, which the
// dialog would report as "not ready yet". This file reads the migration
// itself, so neither can drift silently.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REENABLE_DETAIL_KINDS,
  REENABLE_NOTE_MIN_LENGTH,
  classifyReenableError,
} from "./whatsappReenable";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const MIGRATION = read("../../supabase/migrations/20261014120000_whatsapp_number_opt_out.sql");
const RPC_WRAPPERS = read("../supabase/rpc.ts");
const REPOSITORY = read("../supabase/repositories/whatsappOptOutRepo.ts");

/** The `create or replace function` statement for `name`, through its closing `$$;`. */
function functionDefinition(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  const bodyStart = start === -1 ? -1 : MIGRATION.indexOf("as $$", start);
  const end = bodyStart === -1 ? -1 : MIGRATION.indexOf("$$;", bodyStart + "as $$".length);
  if (end === -1) throw new Error(`${name} is not defined in the migration`);
  return MIGRATION.slice(start, end);
}

/** The argument names in a function's signature, in order. */
function signatureArguments(definition: string): string[] {
  const open = definition.indexOf("(");
  const close = definition.indexOf(")\nreturns");
  return definition
    .slice(open + 1, close)
    .split(",")
    .map((arg) => arg.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** One exported wrapper in rpc.ts, through its closing brace. */
function wrapper(name: string): string {
  const start = RPC_WRAPPERS.indexOf(`export function ${name}(`);
  if (start === -1) throw new Error(`${name} is not exported from rpc.ts`);
  return RPC_WRAPPERS.slice(start, RPC_WRAPPERS.indexOf("\n}\n", start));
}

const SCOPE = functionDefinition("staff_whatsapp_number_opt_out_scope");
const REENABLE = functionDefinition("staff_reenable_whatsapp_number");
const BOTH = `${SCOPE}\n${REENABLE}`;

const emittedDetails = [...BOTH.matchAll(/detail\s*=\s*'([a-z_0-9]+)'/g)].map((match) => match[1]);

describe("WhatsApp re-enable: the migration and the app agree", () => {
  it("reads the DETAIL codes the two functions raise", () => {
    expect(new Set(emittedDetails)).toEqual(
      new Set(["invalid_phone", "permission_note_required", "reenable_scope_changed", "nothing_to_reenable"]),
    );
  });

  it.each([...new Set(emittedDetails)])("classifies %s as a specific refusal", (details) => {
    const kind = classifyReenableError({ code: "P0001", details });
    expect(kind).not.toBe("unknown");
    expect(kind).not.toBe("network");
    expect(REENABLE_DETAIL_KINDS[details]).toBe(kind);
  });

  it("knows no DETAIL code the functions never raise", () => {
    expect(Object.keys(REENABLE_DETAIL_KINDS).sort()).toEqual([...new Set(emittedDetails)].sort());
  });

  it("maps the staff-only refusal of both functions to not_staff", () => {
    expect(SCOPE).toMatch(/errcode\s*=\s*'42501'/);
    expect(REENABLE).toMatch(/errcode\s*=\s*'42501'/);
    expect(classifyReenableError({ code: "42501", details: null })).toBe("not_staff");
  });

  it("holds the permission note to the server's own minimum", () => {
    // The server trims spaces only (btrim) and then counts characters; the
    // client trims every kind of whitespace first, so it is never looser.
    expect(REENABLE).toMatch(/v_note text := btrim\(coalesce\(p_permission_note, ''\)\)/);
    const minimum = /length\(v_note\)\s*<\s*(\d+)/.exec(REENABLE);
    expect(minimum).not.toBeNull();
    expect(Number(minimum?.[1])).toBe(REENABLE_NOTE_MIN_LENGTH);
  });

  it("sends every argument the re-enable takes, and no other", () => {
    const args = signatureArguments(REENABLE);
    expect(args).toEqual(["p_phone", "p_human_ids", "p_last_stop_at", "p_permission_note"]);
    const body = wrapper("reenableWhatsappNumber");
    expect(body).toContain('"staff_reenable_whatsapp_number"');
    for (const arg of args) expect(body).toContain(`${arg}:`);
    expect([...body.matchAll(/\b(p_[a-z_]+):/g)].map((match) => match[1])).toEqual(args);
  });

  it("sends the phone the scope read takes", () => {
    expect(signatureArguments(SCOPE)).toEqual(["p_phone"]);
    const body = wrapper("getWhatsappNumberOptOutScope");
    expect(body).toContain('"staff_whatsapp_number_opt_out_scope"');
    expect([...body.matchAll(/\b(p_[a-z_]+):/g)].map((match) => match[1])).toEqual(["p_phone"]);
  });

  it("reads only columns the audit table has, and staff may read it", () => {
    const start = MIGRATION.indexOf("create table if not exists public.whatsapp_opt_out_reenables (");
    expect(start).toBeGreaterThan(-1);
    const body = MIGRATION.slice(MIGRATION.indexOf("(", start) + 1, MIGRATION.indexOf("\n);", start));
    const columns = body
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
    const selected = /REENABLE_AUDIT_COLUMNS = "([^"]+)"/.exec(REPOSITORY)?.[1].split(/,\s*/) ?? [];
    expect(selected).toEqual(["id", "human_ids", "conversation_ids", "permission_note", "reenabled_by", "reenabled_at"]);
    for (const column of [...selected, "phone_key"]) expect(columns).toContain(column);
    expect(REPOSITORY).toContain('.eq("phone_key", phoneKey)');
    expect(MIGRATION).toMatch(/grant select on table public\.whatsapp_opt_out_reenables to authenticated;/);
    expect(MIGRATION).toMatch(/on public\.whatsapp_opt_out_reenables\s+for select to authenticated\s+using \(public\.is_staff\(\)\);/);
    // reenabled_by is auth.uid(), the id the hook compares the session with.
    expect(MIGRATION).toMatch(/values \(v_key, v_humans, v_conversations, v_note, auth\.uid\(\)\)/);
  });
});
