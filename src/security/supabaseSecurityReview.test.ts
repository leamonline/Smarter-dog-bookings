import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function getAllMigrationSqls(): string[] {
  const migrationsDir = join(root, "supabase/migrations");

  return readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(migrationsDir, file), "utf8"));
}

function getMigrationBySql(predicate: (sql: string) => boolean): string {
  const candidates = getAllMigrationSqls().filter(predicate);

  expect(candidates).toHaveLength(1);

  return candidates[0];
}

// Like getMigrationBySql, but returns the LAST (latest by filename) match.
// Use for invariants whose policy/function is re-issued across several
// migrations, where only the final definition is the effective one — so a
// later migration that re-opens the hole makes the assertion fail.
function lastMigrationSqlMatching(predicate: (sql: string) => boolean): string {
  const matches = getAllMigrationSqls().filter(predicate);

  expect(matches.length).toBeGreaterThan(0);

  return matches[matches.length - 1];
}

function fixMigration(): string {
  return getMigrationBySql(
    (sql: string) =>
      sql.includes("bookings_status_check") &&
      sql.includes("demo_add_dog"),
  );
}

function allMigrationSql(): string {
  return getAllMigrationSqls().join("\n\n");
}

function codexScanFixMigration(): string {
  return getMigrationBySql((sql: string) =>
    sql.includes("Fix Codex Security scan findings"),
  );
}

function linkCustomerSessionOnlyMigration(): string {
  return getMigrationBySql((sql: string) =>
    sql.includes("link_customer_to_human_session_only"),
  );
}

// Walk migrations in filename order and return the final state of a named
// RLS policy on a given table: 'created' if the most recent statement is a
// CREATE POLICY, 'dropped' if it's a DROP POLICY, 'absent' if never seen.
function finalPolicyState(
  policyName: string,
  table: string,
): "created" | "dropped" | "absent" {
  const tablePat = `(?:public\\.)?${table}`;

  // Policy names may be quoted ("staff_select_waitlist") or bare
  // (staff_select_waitlist) in our migrations — both are valid SQL. Match
  // either so the guard sees unquoted drops too (the form that hid the
  // waitlist staff-lockout regression). The required trailing `\s+on`
  // prevents a bare name matching a longer identifier prefix.
  const createRe = new RegExp(
    `create\\s+policy\\s+"?${policyName}"?\\s+on\\s+${tablePat}`,
    "gi",
  );

  const dropRe = new RegExp(
    `drop\\s+policy(?:\\s+if\\s+exists)?\\s+"?${policyName}"?\\s+on\\s+${tablePat}`,
    "gi",
  );

  let state: "created" | "dropped" | "absent" = "absent";

  for (const sql of getAllMigrationSqls()) {
    const events = [
      ...Array.from(sql.matchAll(createRe), (match) => ({
        index: match.index ?? 0,
        kind: "created" as const,
      })),
      ...Array.from(sql.matchAll(dropRe), (match) => ({
        index: match.index ?? 0,
        kind: "dropped" as const,
      })),
    ].sort((a, b) => a.index - b.index);

    for (const { kind } of events) {
      state = kind;
    }
  }

  return state;
}

describe("Supabase security review regressions", () => {
  it("removes the demo RPC bypass from the database and customer dog form", () => {
    const migration = fixMigration();
    const addDogInline = readProjectFile("src/components/customer/booking/AddDogInline.tsx");

    expect(migration).toMatch(/drop\s+function\s+if\s+exists\s+public\.demo_add_dog\(text,\s*text,\s*text,\s*uuid\)/i);
    expect(migration).toMatch(/drop\s+function\s+if\s+exists\s+public\.get_demo_customer\(uuid\)/i);
    expect(migration).toMatch(/drop\s+function\s+if\s+exists\s+public\.get_demo_customers\(\)/i);
    expect(addDogInline).not.toContain("demo_add_dog");
  });

  it("locks down the public debug and briefings exposure paths", () => {
    const migration = fixMigration();

    expect(migration).toMatch(/drop\s+view\s+if\s+exists\s+public\.whatsapp_agent_trigger_log/i);
    expect(migration).toMatch(/revoke\s+all\s+(?:privileges\s+)?on\s+table\s+public\.briefings\s+from\s+public,\s+anon,\s+authenticated/i);
    expect(migration).toMatch(/drop\s+policy\s+if\s+exists\s+"Allow service role full access"\s+on\s+public\.briefings/i);
  });

  it("constrains booking statuses and restores update notification triggers", () => {
    const migration = fixMigration();

    expect(migration).toMatch(/alter\s+table\s+public\.bookings\s+alter\s+column\s+status\s+set\s+default\s+'Booked'/i);
    expect(migration).toMatch(/add\s+constraint\s+bookings_status_check/i);
    expect(migration).toMatch(/'waitlist_joined'/i);
    expect(migration).toMatch(/'ready'/i);
    expect(migration).toMatch(/drop\s+trigger\s+if\s+exists\s+trg_notify_booking_delete\s+on\s+public\.bookings/i);
    expect(migration).toMatch(/create\s+trigger\s+notify_booking_cancelled_trigger/i);
    expect(migration).toMatch(/create\s+trigger\s+notify_booking_ready_trigger/i);
  });

  it("processes Booked bookings in notification edge functions", () => {
    const confirmed = readProjectFile("supabase/functions/notify-booking-confirmed/index.ts");
    const reminder = readProjectFile("supabase/functions/notify-booking-reminder/index.ts");

    expect(confirmed).toContain('"Booked"');
    expect(confirmed).not.toContain('"Not Arrived"');
    expect(reminder).toContain('"Booked"');
    expect(reminder).not.toContain('"Not Arrived"');
  });

  it("keeps staff profile creation out of customer-authenticated sessions", () => {
    const allSql = allMigrationSql();
    const migration = codexScanFixMigration();

    expect(allSql).not.toMatch(
      /create\s+policy\s+"Users can insert own profile"[\s\S]{0,180}for\s+insert\s+to\s+authenticated/i,
    );
    expect(migration).toMatch(
      /drop\s+policy\s+if\s+exists\s+"Users can insert own profile"\s+on\s+public\.staff_profiles/i,
    );
    expect(migration).toMatch(
      /revoke\s+insert\s+on\s+table\s+public\.staff_profiles\s+from\s+anon,\s*authenticated/i,
    );
  });

  it("hardens link_customer_to_human against anonymous full-row reads", () => {
    const migration = codexScanFixMigration();

    expect(migration).toMatch(/drop\s+function\s+if\s+exists\s+public\.link_customer_to_human\(text\)/i);
    expect(migration).toMatch(/returns\s+table\s*\(/i);
    expect(migration).not.toMatch(/returns\s+setof\s+(?:public\.)?humans/i);
    expect(migration).toMatch(/v_uid\s+uuid\s*:=\s*\(select\s+auth\.uid\(\)\)/i);
    expect(migration).toMatch(/if\s+v_uid\s+is\s+null\s+then\s+raise\s+exception\s+'not_authenticated'/i);
    expect(migration).toMatch(/customer_user_id\s+is\s+distinct\s+from\s+v_uid/i);
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.link_customer_to_human\(text\)\s+from\s+public/i,
    );
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.link_customer_to_human\(text\)\s+from\s+anon/i,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.link_customer_to_human\(text\)\s+to\s+authenticated/i,
    );
  });

  it("derives the lookup phone from auth.users in link_customer_to_human (issue #92)", () => {
    const migration = linkCustomerSessionOnlyMigration();

    // Old (text) overload is dropped, new no-arg signature created
    expect(migration).toMatch(/drop\s+function\s+if\s+exists\s+public\.link_customer_to_human\(text\)/i);
    expect(migration).toMatch(/create\s+function\s+public\.link_customer_to_human\(\)\s*\nreturns\s+table/i);

    // Phone is sourced from auth.users for the calling auth.uid(), not from a parameter
    expect(migration).toMatch(/select\s+phone\s+into\s+v_phone\s+from\s+auth\.users\s+where\s+id\s*=\s*v_uid/i);

    // Auth + verified-phone guards
    expect(migration).toMatch(/if\s+v_uid\s+is\s+null\s+then\s+raise\s+exception\s+'not_authenticated'/i);
    expect(migration).toMatch(/raise\s+exception\s+'no_verified_phone'/i);

    // Grants on the new no-arg signature
    expect(migration).toMatch(/revoke\s+all\s+on\s+function\s+public\.link_customer_to_human\(\)\s+from\s+anon/i);
    expect(migration).toMatch(/grant\s+execute\s+on\s+function\s+public\.link_customer_to_human\(\)\s+to\s+authenticated/i);
  });

  it("does not pass a phone argument from the customer portal RPC call", () => {
    // The customer hook routes through the typed RPC wrapper in
    // src/supabase/rpc.ts; assert both the call site and the wrapper
    // so the no-phone guarantee survives the indirection.
    const useCustomerAuth = readProjectFile("src/supabase/hooks/useCustomerAuth.js");
    const rpcWrapper = readProjectFile("src/supabase/rpc.ts");

    expect(useCustomerAuth).toMatch(/linkCustomerToHuman\(supabase\)/);
    expect(useCustomerAuth).not.toMatch(/link_customer_to_human["'][^)]*p_phone/);

    expect(rpcWrapper).toMatch(/client\.rpc\("link_customer_to_human"\)/);
    expect(rpcWrapper).not.toMatch(/link_customer_to_human["'][^)]*p_phone/);
  });

  it("does not runtime-cache authenticated Supabase API traffic in the PWA", () => {
    const viteConfig = readProjectFile("vite.config.js");

    expect(viteConfig).not.toContain('cacheName: "supabase-api"');
    expect(viteConfig).not.toMatch(/urlPattern:\s*\/\^https:\\\/\\\/\.\*\\\.supabase\\\.co/);
  });

  it("verifies webhook secrets via constant-time compare in all notify-* functions", () => {
    const helper = readProjectFile("supabase/functions/_shared/webhook-auth.ts");

    expect(helper).toMatch(/function\s+timingSafeEqual\b/);
    expect(helper).toMatch(/mismatch\s*\|=\s*[^;]*\^/);
    expect(helper).toMatch(/export\s+function\s+isAuthorizedWebhook\b/);

    const notifyFns = [
      "supabase/functions/notify-booking-confirmed/index.ts",
      "supabase/functions/notify-booking-cancelled/index.ts",
      "supabase/functions/notify-booking-ready/index.ts",
      "supabase/functions/notify-booking-reminder/index.ts",
      "supabase/functions/notify-waitlist-joined/index.ts",
    ];

    for (const path of notifyFns) {
      const fn = readProjectFile(path);
      expect(fn, `${path} imports the timing-safe helper`).toMatch(
        /import\s*{\s*isAuthorizedWebhook\s*}\s*from\s*"\.\.\/_shared\/webhook-auth\.ts"/,
      );
      // The webhook secret must be checked through the timing-safe
      // helper. Either form is OK:
      //   if (!isAuthorizedWebhook(req.headers.get("Authorization"), SECRET))
      //   const ok = isAuthorizedWebhook(req.headers.get("Authorization"), SECRET); if (!ok)
      // notify-booking-reminder uses the second form post-Phase-F (it
      // accepts a staff JWT as an alternative auth path for the
      // dashboard's manual reminder send).
      expect(fn, `${path} uses the helper to check auth`).toMatch(
        /isAuthorizedWebhook\(/,
      );
      expect(fn, `${path} no longer compares WEBHOOK_SECRET with !==`).not.toMatch(
        /authHeader\s*!==\s*`Bearer\s*\$\{WEBHOOK_SECRET\}`/,
      );
    }
  });

  it("verifies the internal/agent secrets via timing-safe compare in all whatsapp-* functions", () => {
    const helper = readProjectFile("supabase/functions/_shared/webhook-auth.ts");
    expect(helper).toMatch(/export\s+function\s+timingSafeEqualHeader\b/);

    const wsFns = [
      "supabase/functions/whatsapp-send/index.ts",
      "supabase/functions/whatsapp-admin/index.ts",
      "supabase/functions/whatsapp-register/index.ts",
      // The agent's implementation lives in handler.ts; index.ts is a
      // serve() shim kept importable for the deno dispatch tests.
      "supabase/functions/whatsapp-agent/handler.ts",
    ];

    for (const path of wsFns) {
      const fn = readProjectFile(path);
      expect(fn, `${path} imports the timing-safe header helper`).toMatch(
        /import\s*{[^}]*timingSafeEqualHeader[^}]*}\s*from\s*"[^"]*_shared\/webhook-auth\.ts"/,
      );
      // No remaining direct `!==` / `===` comparisons against the secret env vars.
      expect(
        fn,
        `${path} no longer compares SEND_INTERNAL_SECRET with ===/!==`,
      ).not.toMatch(
        /!==\s*SEND_INTERNAL_SECRET|SEND_INTERNAL_SECRET\s*!==|===\s*SEND_INTERNAL_SECRET|SEND_INTERNAL_SECRET\s*===/,
      );
      expect(
        fn,
        `${path} no longer compares AGENT_CALLBACK_SECRET with ===/!==`,
      ).not.toMatch(
        /!==\s*AGENT_CALLBACK_SECRET|AGENT_CALLBACK_SECRET\s*!==|===\s*AGENT_CALLBACK_SECRET|AGENT_CALLBACK_SECRET\s*===/,
      );
    }
  });

  it("hardens customer-phone-on-file against IP spoofing and origin-* CORS", () => {
    const fn = readProjectFile(
      "supabase/functions/customer-phone-on-file/index.ts",
    );

    // cf-connecting-ip is set by the Cloudflare ingress and is not caller-
    // controllable; x-forwarded-for is forgeable. The function must read
    // cf-connecting-ip *before* x-forwarded-for so an attacker rotating
    // the forwarded header can't slice the per-IP rate-limit bucket.
    const cfIdx = fn.indexOf('cf-connecting-ip');
    const xfwdIdx = fn.indexOf('x-forwarded-for');
    expect(cfIdx, "cf-connecting-ip must appear before x-forwarded-for").toBeGreaterThan(-1);
    expect(xfwdIdx).toBeGreaterThan(-1);
    expect(cfIdx).toBeLessThan(xfwdIdx);

    // CORS must not be wide-open: an Access-Control-Allow-Origin of "*"
    // would mean any site can poke the membership oracle from a victim's
    // browser. Use an allowlist instead.
    expect(fn).not.toMatch(/"Access-Control-Allow-Origin"\s*:\s*"\*"/);

    // A second, global rate-limit bucket protects against horizontal
    // enumeration even if per-IP buckets get sliced finely.
    expect(fn).toMatch(/customer_phone_lookup_rate_limit/);
    expect(
      fn,
      "function should call the rate-limit RPC at least twice (per-IP + global)",
    ).toMatch(
      /customer_phone_lookup_rate_limit[\s\S]+customer_phone_lookup_rate_limit/,
    );
  });

  it("retires direct customer booking cancellation in favour of the narrow RPC", () => {
    // The original DELETE policy let customers hard-delete future bookings,
    // which bypasses cancel_reason capture and the notify-booking-cancelled
    // trigger. The later broad UPDATE policy also allowed unrelated column
    // changes. Both direct paths stay closed; the RPC accepts only ID/reason.
    expect(finalPolicyState("customer_cancel_own_bookings", "bookings")).toBe(
      "dropped",
    );
    expect(
      finalPolicyState("customer_cancel_own_bookings_update", "bookings"),
    ).toBe("dropped");

    const cancellation = lastMigrationSqlMatching((sql: string) =>
      /create\s+or\s+replace\s+function\s+public\.cancel_customer_booking\s*\(/i.test(
        sql,
      ),
    );
    expect(cancellation).toMatch(
      /create\s+or\s+replace\s+function\s+public\.cancel_customer_booking\s*\(\s*p_booking_id\s+uuid,\s*p_reason\s+text\s*\)/i,
    );
  });

  it("does not leak raw error strings to clients in customer-facing Edge Functions", () => {
    const clientFacingFns = [
      "supabase/functions/calendar-feed/index.ts",
      "supabase/functions/calendar-ics/index.ts",
      "supabase/functions/whatsapp-register/index.ts",
      "supabase/functions/whatsapp-admin/index.ts",
    ];

    for (const path of clientFacingFns) {
      const fn = readProjectFile(path);
      expect(fn, `${path} should not stringify err into the response body`).not.toMatch(
        /error:\s*String\(err\)/,
      );
      expect(fn, `${path} should still log the actual error server-side`).toMatch(
        /console\.error\([^)]*err/,
      );
    }
  });

  it("constrains whatsapp_booking_actions.state to the autonomous-booking state set", () => {
    const migration = getMigrationBySql((sql) =>
      sql.includes("Customer-confirmed autonomous booking") &&
      sql.includes("whatsapp_booking_actions_state_check") &&
      sql.includes("awaiting_customer_confirm")
    );

    // The replacement CHECK must list all four new autonomous states alongside the legacy six.
    expect(migration).toMatch(/awaiting_customer_confirm/);
    expect(migration).toMatch(/'confirmed'/);
    expect(migration).toMatch(/auto_applied/);
    expect(migration).toMatch(/rejected_by_customer/);
    // Legacy states still present
    expect(migration).toMatch(/'pending'/);
    expect(migration).toMatch(/'applied'/);
  });

  it("adds the confirm-tracking columns and lead-collection columns", () => {
    const migration = getMigrationBySql((sql) =>
      sql.includes("customer_confirm_message_id") &&
      sql.includes("lead_status")
    );

    expect(migration).toMatch(/add column (?:if not exists )?customer_confirm_message_id text/i);
    expect(migration).toMatch(/add column (?:if not exists )?customer_confirm_expires_at timestamptz/i);
    expect(migration).toMatch(/add column (?:if not exists )?lead_status text/i);
    expect(migration).toMatch(/add column (?:if not exists )?lead_payload jsonb/i);
    expect(migration).toMatch(/add column (?:if not exists )?autonomous_booking_enabled boolean not null default false/i);
    expect(migration).toMatch(/alter table humans\s+add column\s+(?:if not exists\s+)?source text/i);
  });

  it("keeps the staff-only is_staff() check on the legacy pending application path", () => {
    // apply_whatsapp_booking_action has been re-issued by multiple
    // migrations (autonomous booking, then the whatsapp_conversation_id
    // link in May 2026). Every replacement must preserve the security
    // gates, so we assert against ALL of them rather than a single
    // canonical one.
    const candidates = getAllMigrationSqls().filter(
      (sql) =>
        sql.includes("create or replace function apply_whatsapp_booking_action") &&
        sql.includes("state not in ('pending', 'confirmed')")
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    for (const migration of candidates) {
      // Autonomous path uses state='confirmed' (set under service-role) and skips is_staff.
      // Staff path keeps is_staff() — verify the conditional gate is present.
      expect(migration).toMatch(/state = 'pending' and not is_staff\(\)/);
      expect(migration).toMatch(/'whatsapp_ai_auto'/);
      // Match 'whatsapp_ai' as a whole token — avoid matching as a prefix of 'whatsapp_ai_auto'.
      expect(migration).toMatch(/'whatsapp_ai'(?!_auto)/);
    }
  });

  it("apply-customer-confirm requires the internal secret and only acts on awaiting_customer_confirm", () => {
    const fn = readProjectFile("supabase/functions/apply-customer-confirm/index.ts");

    expect(fn).toMatch(/timingSafeEqualHeader\(\s*req\.headers\.get\("x-internal-secret"\)/);
    expect(fn).toMatch(/APPLY_CONFIRM_INTERNAL_SECRET/);
    expect(fn).toMatch(/state\s*!==\s*"awaiting_customer_confirm"/);
    expect(fn).toMatch(/customer_confirm_expires_at/);
    // Capacity is enforced via the validate_booking_capacity trigger; the
    // function detects its exceptions through isCapacityError rather than
    // pre-checking with an isSlotFree helper.
    expect(fn).toMatch(/isCapacityError\b/);
    // Fall back to pending on apply failure so leads aren't lost.
    expect(fn).toMatch(/state:\s*"pending"/);
  });

  it("whatsapp-agent only calls apply-customer-confirm with shared secret", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-agent/handler.ts");

    expect(fn).toMatch(/apply-customer-confirm/);
    expect(fn).toMatch(/x-internal-secret/);
    expect(fn).toMatch(/APPLY_CONFIRM_INTERNAL_SECRET/);
    // canAutoBook gate present before dispatchConfirmButtons.
    expect(fn).toMatch(/canAutoBook\(/);
    expect(fn).toMatch(/dispatchConfirmButtons\(/);
  });

  it("whatsapp-send confirm_buttons mode posts Meta interactive buttons and writes message id", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-send/index.ts");
    // The interactive-button payload and state-transition logic live in the
    // shared confirmButtons.ts helper (imported by whatsapp-send at runtime).
    const helper = readProjectFile("supabase/functions/_shared/confirmButtons.ts");

    expect(fn).toMatch(/"confirm_buttons"/);
    expect(helper).toMatch(/type:\s*"interactive"/);
    expect(helper).toMatch(/customer_confirm_message_id/);
    expect(helper).toMatch(/awaiting_customer_confirm/);
  });

  it("AI-onboarded humans are tagged source=whatsapp_ai for the correction path", () => {
    const fn = readProjectFile("supabase/functions/whatsapp-agent/handler.ts");

    expect(fn).toMatch(/source:\s*"whatsapp_ai"/);
    expect(fn).toMatch(/applyPostCreationCorrections\b/);
    expect(fn).toMatch(/HUMAN_UPDATE_WHITELIST/);
    expect(fn).toMatch(/DOG_UPDATE_WHITELIST/);
  });

  it("pins feed_type so a customer cannot mint a staff calendar feed token", () => {
    // Regression for the calendar-feed token-type escalation (Critical).
    // The customer branch of manage_own_feed_tokens originally constrained
    // only human_id, so a logged-in customer could INSERT a feed_type='staff'
    // row with their own human_id and then read the ENTIRE salon's bookings
    // (plus every customer's name) via /calendar-feed. The effective policy
    // must pin feed_type in BOTH the using and with-check clauses of each
    // branch, and direct INSERT/UPDATE on the table must be revoked from the
    // JWT roles (token creation goes through the SECURITY DEFINER RPCs).
    const migration = lastMigrationSqlMatching((sql) =>
      /create\s+policy\s+manage_own_feed_tokens\s+on\s+(?:public\.)?calendar_feed_tokens/i.test(
        sql,
      ),
    );

    // Isolate the policy statement itself (up to its terminating semicolon)
    // so prose in the migration header can't satisfy these assertions.
    const fromPolicy = migration.slice(
      migration.search(/create\s+policy\s+manage_own_feed_tokens/i),
    );
    const policyStmt = fromPolicy.split(";")[0];

    const customerPins = policyStmt.match(/feed_type\s*=\s*'customer'/gi) ?? [];
    const staffPins = policyStmt.match(/feed_type\s*=\s*'staff'/gi) ?? [];

    expect(
      customerPins.length,
      "customer branch must pin feed_type='customer' in both using and with check",
    ).toBe(2);
    expect(
      staffPins.length,
      "staff branch must pin feed_type='staff' in both using and with check",
    ).toBe(2);

    // Belt-and-braces: the JWT roles cannot write tokens directly.
    expect(migration).toMatch(
      /revoke\s+insert,\s*update\s+on\s+(?:table\s+)?public\.calendar_feed_tokens\s+from\s+authenticated,\s*anon/i,
    );
  });

  it("exposes slot occupancy to customers via a PII-free, Cancelled-excluding, authenticated-only SECURITY DEFINER RPC", () => {
    // Regression for "availability ignores other customers' bookings". The
    // customer client only sees its own bookings under RLS, so the capacity
    // engine computed availability from incomplete data and offered full
    // slots (failing only at checkout). get_slot_occupancy is SECURITY
    // DEFINER so it sees ALL rows — but it must stay locked down: only
    // (slot, size) out (no PII/ids/status), Cancelled excluded so its seat
    // math matches get_seats_used / has_large_dog, and authenticated-only
    // (the booking wizard is login-gated).
    const migration = getMigrationBySql((sql) =>
      sql.includes("create or replace function public.get_slot_occupancy"),
    );

    // SECURITY DEFINER + pinned search_path (matches the capacity helpers).
    expect(migration).toMatch(
      /create\s+or\s+replace\s+function\s+public\.get_slot_occupancy\(p_date\s+date\)/i,
    );
    expect(migration).toMatch(/security\s+definer/i);
    expect(migration).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);

    // Returns ONLY (slot, size) — no ids, no PII, no status leaked out.
    expect(migration).toMatch(
      /returns\s+table\s*\(\s*slot\s+text\s*,\s*size\s+text\s*\)/i,
    );

    // Excludes Cancelled so its seat math matches get_seats_used/has_large_dog.
    expect(migration).toMatch(/status\s*<>\s*'Cancelled'/i);

    // Locked down: revoked from public, granted to authenticated, NOT anon.
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.get_slot_occupancy\(date\)\s+from\s+public/i,
    );
    // Explicit anon revoke is REQUIRED, not optional: Supabase's default
    // privileges auto-grant EXECUTE to anon on new public functions, so
    // revoking only PUBLIC (as get_open_days originally did — since fixed)
    // leaves anon able to call it. This positive assertion stops a future
    // re-issue from regressing to the leaky pattern.
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.get_slot_occupancy\(date\)\s+from\s+anon/i,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_slot_occupancy\(date\)\s+to\s+authenticated/i,
    );
    // Scope the anon check to a GRANT statement for THIS function — the
    // migration comment and the revoke statement both mention "anon", which
    // is fine; only a grant to anon would be the bug.
    expect(migration).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_slot_occupancy\(date\)\s+to\s+[^;]*\banon\b/i,
    );
  });

  it("locks get_open_days to authenticated by explicitly revoking the anon default-privilege grant", () => {
    // get_open_days's original migration only revoked PUBLIC, so Supabase's
    // default-privilege grant left anon able to read the closure calendar
    // via /rest/v1/rpc/get_open_days without signing in. The follow-up
    // migration must explicitly revoke anon (and re-grant authenticated).
    const migration = getMigrationBySql((sql) =>
      sql.includes("Lock get_open_days to authenticated only"),
    );

    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.get_open_days\(date,\s*date\)\s+from\s+anon/i,
    );
    expect(migration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_open_days\(date,\s*date\)\s+to\s+authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_open_days\(date,\s*date\)\s+to\s+[^;]*\banon\b/i,
    );
  });

  it("locks day_settings to staff-only direct access, leaving get_open_days as the customer read path", () => {
    // day_settings carries internal fields (overrides, extra_slots) that must
    // stay staff-only. The leaky SELECT existed under TWO names: the file name
    // customer_select_day_settings (20260401142945) and the live prod-drift
    // name combined_select_day_settings (USING (true)). Both must end 'dropped'
    // so the lockdown converges on a fresh db reset AND on drifted prod.
    expect(finalPolicyState("customer_select_day_settings", "day_settings")).toBe(
      "dropped",
    );
    expect(finalPolicyState("combined_select_day_settings", "day_settings")).toBe(
      "dropped",
    );

    // Staff must retain a SELECT path: their calendar reads, upserts (the
    // ON CONFLICT path needs a SELECT policy) and realtime postgres_changes
    // subscriptions (RLS-gated on SELECT) all depend on it. Full reconciliation
    // retires the broad FOR ALL policy in favour of explicit per-command ones.
    expect(finalPolicyState("staff_select_day_settings", "day_settings")).toBe(
      "created",
    );
    expect(finalPolicyState("staff_all_day_settings", "day_settings")).toBe(
      "dropped",
    );
    expect(finalPolicyState("staff_insert_day_settings", "day_settings")).toBe(
      "created",
    );
    expect(finalPolicyState("staff_update_day_settings", "day_settings")).toBe(
      "created",
    );
    expect(finalPolicyState("staff_delete_day_settings", "day_settings")).toBe(
      "created",
    );

    // The customer-safe RPC remains the sole customer read path: returns only
    // (setting_date, is_open). Re-issued by the booking-policy programme to
    // add runtime-aware range validation, so check the LATEST definition —
    // a later migration that widened the result shape would fail here.
    const rpc = lastMigrationSqlMatching((sql) =>
      sql.includes("create or replace function public.get_open_days"),
    );
    expect(rpc).toMatch(
      /returns\s+table\s*\(\s*setting_date\s+date\s*,\s*is_open\s+boolean\s*\)/i,
    );
  });

  it("makes every non-staff booking insert calendar-safe via a trigger + the customer RPC", () => {
    // The capacity trigger never checked day_settings.is_open/overrides or
    // booking_date, so a direct insert could land on a closed/past/blocked
    // slot. A BEFORE INSERT trigger now runs the shared calendar gate for
    // every non-staff insert (customer RPC, WhatsApp autonomous, Flow endpoint).
    // The trigger + shared-gate lockdown live in the migration that creates
    // the trigger (unique). create_customer_booking_group is re-issued by a
    // later migration that adds the profile gate, so it is NOT unique — its
    // grant lockdown is checked against the LATEST definition below.
    const migration = getMigrationBySql((sql) =>
      sql.includes("create trigger trg_enforce_booking_calendar"),
    );

    // Enforcement trigger fires BEFORE INSERT on bookings.
    expect(migration).toMatch(
      /create\s+trigger\s+trg_enforce_booking_calendar\s+before\s+insert\s+on\s+public\.bookings/i,
    );

    // The shared gate is internal-only — revoked from anon, so it is never
    // reachable via /rest/v1/rpc.
    expect(migration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.validate_booking_calendar\(date,\s*text\)\s+from\s+[^;]*\banon\b/i,
    );

    // The customer RPC's EFFECTIVE (latest) definition stays locked to
    // authenticated: anon revoked, authenticated granted, anon never
    // re-granted (Supabase's default-privilege trap). Using the last match
    // means a later re-issue that re-opens anon would fail this.
    const rpc = lastMigrationSqlMatching((sql) =>
      sql.includes("create or replace function public.create_customer_booking_group"),
    );
    expect(rpc).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.create_customer_booking_group\(jsonb,\s*date\)\s+from\s+anon/i,
    );
    expect(rpc).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.create_customer_booking_group\(jsonb,\s*date\)\s+to\s+authenticated/i,
    );
    expect(rpc).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.create_customer_booking_group\(jsonb,\s*date\)\s+to\s+[^;]*\banon\b/i,
    );
  });

  it("removes raw customer booking inserts, leaving table inserts staff-only", () => {
    // 'combined_insert_bookings' is the live (drift) policy that allowed
    // is_staff() OR <owns the dog>; only this migration references it.
    const migration = getMigrationBySql((sql) =>
      sql.includes("combined_insert_bookings"),
    );

    expect(migration).toMatch(
      /drop\s+policy\s+if\s+exists\s+"combined_insert_bookings"\s+on\s+public\.bookings/i,
    );
    expect(migration).toMatch(
      /drop\s+policy\s+if\s+exists\s+"customer_insert_own_bookings"\s+on\s+public\.bookings/i,
    );

    // Replacement insert policy is staff-only: WITH CHECK is is_staff() ALONE,
    // with no dogs/humans ownership branch a customer could satisfy.
    const insertPolicyBlock =
      migration.match(/create\s+policy\s+"staff_insert_bookings"[\s\S]*?;/i)?.[0] ?? "";
    expect(insertPolicyBlock).toMatch(
      /for\s+insert\s+to\s+authenticated\s+with\s+check\s*\(\s*is_staff\(\)\s*\)/i,
    );
    expect(insertPolicyBlock).not.toMatch(/customer_user_id/i);

    // Final effective state across ALL migrations: a later migration that
    // re-opens a permissive customer insert would flip these and fail.
    expect(finalPolicyState("staff_insert_bookings", "bookings")).toBe("created");
    expect(finalPolicyState("customer_insert_own_bookings", "bookings")).toBe("dropped");
  });

  it("keeps a combined staff+customer access policy on waitlist_entries after every migration", () => {
    // Regression for 20260422081058_performance_advisors.sql, which dropped
    // staff_*_waitlist citing combined_* replacements that were never
    // committed (they existed only as live-DB drift). On a fresh
    // `supabase db reset` that left waitlist_entries with customer own-row
    // policies but NO staff access. The corrective migration commits the
    // combined policies so a from-scratch build reproduces prod.
    for (const cmd of ["select", "insert", "delete"]) {
      expect(
        finalPolicyState(`combined_${cmd}_waitlist_entries`, "waitlist_entries"),
        `combined_${cmd}_waitlist_entries must survive to the final migration state`,
      ).toBe("created");
    }

    // The legacy per-role staff policies are intentionally retired. Asserting
    // "dropped" also proves the now quote-insensitive finalPolicyState sees
    // the unquoted drops the old (quoted-only) helper was blind to.
    expect(finalPolicyState("staff_select_waitlist", "waitlist_entries")).toBe("dropped");
    expect(finalPolicyState("staff_insert_waitlist", "waitlist_entries")).toBe("dropped");
    expect(finalPolicyState("staff_delete_waitlist", "waitlist_entries")).toBe("dropped");
  });
});
