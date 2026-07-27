import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("AI WhatsApp operational controls", () => {
  it("creates a durable staff-only global switch and an allowed-by-default customer preference", () => {
    const sql = read(
      "supabase/migrations/20260727121000_ai_whatsapp_controls.sql",
    );

    expect(sql).toMatch(/create table (?:if not exists )?public\.ai_whatsapp_settings/i);
    expect(sql).toMatch(/enabled boolean not null default true/i);
    expect(sql).toMatch(
      /alter table public\.humans\s+add column if not exists ai_whatsapp_allowed boolean not null default true/i,
    );
    expect(sql).toMatch(/revoke all on public\.ai_whatsapp_settings from anon, authenticated/i);
    expect(sql.match(/if not public\.is_staff\(\)/gi)?.length).toBeGreaterThanOrEqual(2);
  });

  it("restores the singleton in schema-only CI baselines", () => {
    const fixture = read(
      "supabase/tests/fixtures/booking_policy_partial_baseline_seed.psql",
    );

    expect(fixture).toMatch(
      /if to_regclass\('public\.ai_whatsapp_settings'\) is not null then/i,
    );
    expect(fixture).toMatch(
      /insert into public\.ai_whatsapp_settings\(singleton, enabled\)\s+values \(true, true\)\s+on conflict \(singleton\) do nothing/i,
    );
  });

  it("gates AI-labelled sends before dispatch while leaving manual sends outside the gate", () => {
    const send = read("supabase/functions/whatsapp-send/index.ts");

    const gate = send.indexOf("checkAiMessagingPermission");
    const dispatch = send.indexOf('if (parsed.mode === "draft")');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(dispatch).toBeGreaterThan(gate);
    expect(send).toContain("body.ai_initiated !== true");
  });

  it("labels every whatsapp-agent and automated confirmation send as AI-initiated", () => {
    const agent = read("supabase/functions/whatsapp-agent/handler.ts");
    const applyConfirm = read(
      "supabase/functions/apply-customer-confirm/index.ts",
    );

    expect(agent).toContain("ai_initiated: true");
    expect(agent).toContain(
      "JSON.stringify({ ...body, ai_initiated: true })",
    );
    expect(agent.match(/fetch\(WHATSAPP_SEND_URL/g)?.length).toBe(
      agent.match(/ai_initiated: true/g)?.length,
    );
    expect(applyConfirm).toMatch(
      /mode:\s*"manual",\s*ai_initiated:\s*true/,
    );
  });
});
