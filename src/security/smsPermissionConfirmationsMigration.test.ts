// The staff SMS confirmation after a STOP (migration 20261104100000) writes the
// proof that lifts a consent pause. Its security properties are asserted here
// statically; supabase/tests/261 proves the behaviour against a real database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261104100000_sms_permission_confirmations.sql"), "utf8");
const code = sql.replace(/--.*$/gm, "");

function functionBody(name: string): string {
  const start = code.indexOf(`function public.${name}`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  return code.slice(start, code.indexOf("$$;", start));
}

describe("20261104100000_sms_permission_confirmations.sql", () => {
  it("keeps the audit table behind RLS, readable by staff only, writable by no client", () => {
    expect(code).toMatch(/alter table public\.sms_permission_confirmations enable row level security/);
    expect(code).toMatch(/revoke all on table public\.sms_permission_confirmations from authenticated/);
    expect(code).toMatch(/grant select on table public\.sms_permission_confirmations to authenticated/);
    expect(code).not.toMatch(/grant (insert|update|delete)[^;]*sms_permission_confirmations/i);
    expect(code).toMatch(/for select to authenticated\s+using \(public\.is_staff\(\)\)/);
    expect(code).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
  });

  it("makes a person's decision name the person and say why", () => {
    expect(code).toMatch(/action = 'superseded_by_stop' or \(confirmed_by is not null and length\(btrim\(reason\)\) >= 10\)/);
  });

  for (const name of ["staff_confirm_sms_permission", "staff_withdraw_sms_permission"]) {
    it(`${name} is staff-only, pinned to a search_path, and not callable by anon`, () => {
      const body = functionBody(name);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public, pg_temp/);
      expect(body).toMatch(/if not public\.is_staff\(\) then\s+raise exception 'staff only' using errcode = '42501'/);
      expect(body).toMatch(/length\(v_reason\) < 10/);
      expect(body).toMatch(/auth\.uid\(\)/);
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${name}\\(uuid, text\\) from public`));
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${name}\\(uuid, text\\) from anon`));
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${name}\\(uuid, text\\) to authenticated`));
    });
  }

  it("never touches WhatsApp opt-out: SMS and WhatsApp permission are separate decisions", () => {
    for (const name of ["staff_confirm_sms_permission", "staff_withdraw_sms_permission"]) {
      expect(functionBody(name)).not.toMatch(/update public\.humans\s+set[^;]*whatsapp_opted_out/);
    }
  });

  it("refuses to confirm someone who opted out of SMS", () => {
    expect(functionBody("staff_confirm_sms_permission")).toMatch(/if v_human\.sms_opted_out then/);
  });

  it("guards preferred_channel = 'sms' so only the audited action sets it, and a new STOP clears it", () => {
    const guard = functionBody("humans_guard_sms_confirmation");
    expect(guard).toMatch(/security definer/);
    expect(guard).toMatch(/superseded_by_stop/);
    expect(guard).toMatch(/smarter_dog\.sms_confirmation/);
    expect(guard).toMatch(/sms_confirmation_needs_staff_action/);
    expect(code).toMatch(/create or replace trigger zz_humans_sms_confirmation_guard\s+before insert or update of preferred_channel, whatsapp_opted_out on public\.humans/);
    expect(code).toMatch(/revoke all on function public\.humans_guard_sms_confirmation\(\) from authenticated/);
  });

  it("backfills or edits no existing rows", () => {
    expect(code).not.toMatch(/\bupdate public\.humans\s+set[^;]*where true/i);
    expect(code).not.toMatch(/\binsert into public\.sms_permission_confirmations[^;]*select\b/i);
    expect(code).not.toMatch(/\bdelete from\b/i);
  });
});
