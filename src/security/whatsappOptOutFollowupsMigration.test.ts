// The WhatsApp opt-out follow-ups (migration 20261016120000, #1016 deferred
// gaps G1-G4) re-issue two functions already applied in production. Each must
// be the earlier body plus exactly the audited addition, nothing else.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const NEW_FILE = "20261016120000_whatsapp_opt_out_followups.sql";
const MERGE_FILE = "20261001160000_late_cancellation_history.sql";
const OPT_OUT_FILE = "20261014120000_whatsapp_number_opt_out.sql";

const read = (name: string) => readFileSync(join(migrationsDir, name), "utf8");
const newSql = () => (existsSync(join(migrationsDir, NEW_FILE)) ? read(NEW_FILE) : "");

function extractFunction(sql: string, header: string): string {
  const start = sql.indexOf(header);
  expect(start, `${header} is defined`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

// The only change to merge_humans: one new leading WHEN in each of the two
// WhatsApp opt-out CASEs, so a STOP label on either record survives.
const MERGE_AT_BRANCH = `
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then coalesce(
            least(
              case when w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp' then w.whatsapp_opted_out_at end,
              case when l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp' then l.whatsapp_opted_out_at end),
            w.whatsapp_opted_out_at, l.whatsapp_opted_out_at, now())`;
const MERGE_REASON_BRANCH = `
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then 'asked_on_whatsapp'`;

// The only change to humans_guard_whatsapp_reenable: a refusal when the record
// is linked to a conversation that is stopped now.
const GUARD_LINK_BLOCK = `
  -- Linked to a conversation that is stopped now: refuse only. A link never
  -- FLAGS a record (links go stale, #1016); the audited re-enable passes
  -- through the setting checked above.
  if exists (
    select 1 from public.whatsapp_conversations c
     where c.human_id = old.id
       and c.channel = 'whatsapp'
       and c.whatsapp_opted_out_at is not null
  ) then
    raise exception 'This customer''s WhatsApp conversation asked for messages to stop. Switch WhatsApp back on for that number with the customer''s renewed permission instead.'
      using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
  end if;`;

function removeOnce(text: string, part: string): string {
  const at = text.indexOf(part);
  expect(at, "the addition is present").toBeGreaterThanOrEqual(0);
  expect(text.indexOf(part, at + 1), "the addition appears once").toBe(-1);
  return text.slice(0, at) + text.slice(at + part.length);
}

function lastDefiner(name: string): string | undefined {
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(public\\.)?${name}\\s*\\(`, "i");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter((file) => pattern.test(read(file)))
    .at(-1);
}

describe("WhatsApp opt-out follow-ups migration (20261016120000)", () => {
  it("re-issues merge_humans byte-for-byte except the two STOP-label branches", () => {
    const header = "create or replace function public.merge_humans(p_winner uuid, p_loser uuid)";
    const before = extractFunction(read(MERGE_FILE), header);
    const after = extractFunction(newSql(), header);
    expect(removeOnce(removeOnce(after, MERGE_AT_BRANCH), MERGE_REASON_BRANCH)).toBe(before);
  });

  it("is the last migration defining merge_humans and humans_guard_whatsapp_reenable", () => {
    expect(lastDefiner("merge_humans")).toBe(NEW_FILE);
    expect(lastDefiner("humans_guard_whatsapp_reenable")).toBe(NEW_FILE);
  });

  it("re-issues humans_guard_whatsapp_reenable with only the link refusal added", () => {
    const header = "create or replace function public.humans_guard_whatsapp_reenable()";
    const before = extractFunction(read(OPT_OUT_FILE), header);
    const after = extractFunction(newSql(), header);
    expect(removeOnce(after, GUARD_LINK_BLOCK)).toBe(before);
    // Placed after the number loop, before the function lets the row through.
    expect(after).toContain(`  end loop;${GUARD_LINK_BLOCK}\n  return new;`);
  });

  it("is drop-free, sets a lock timeout and revokes every new function from the API roles", () => {
    const sql = newSql();
    expect(sql).not.toMatch(/\bdrop\s/i);
    // The one "delete from" is merge_humans's own removal of the loser,
    // copied unchanged (byte identity above). Nothing else may delete.
    const deletes = sql.match(/delete\s+from/gi) ?? [];
    expect(deletes.length).toBe(1);
    expect(extractFunction(sql, "create or replace function public.merge_humans(")).toContain(
      "  delete from public.humans where id = p_loser;",
    );
    expect(sql).toContain("set local lock_timeout = '5s';");
    for (const sig of ["public.apply_whatsapp_stop(uuid, text)", "public.whatsapp_conversation_supersede_stop_acks()"]) {
      for (const role of ["public", "anon", "authenticated"]) {
        expect(sql, `${sig} revoked from ${role}`).toContain(`revoke all on function ${sig} from ${role};`);
      }
    }
    expect(sql).toContain("grant execute on function public.apply_whatsapp_stop(uuid, text) to service_role;");
  });

  it("leaves staff_reenable_whatsapp_number as production has it", () => {
    expect(newSql()).not.toMatch(/create\s+or\s+replace\s+function\s+(public\.)?staff_reenable_whatsapp_number/i);
    expect(newSql()).toMatch(/^set local lock_timeout = '5s';$/m);
  });
});
