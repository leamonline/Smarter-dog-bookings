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

  const createRe = new RegExp(
    `create\\s+policy\\s+"${policyName}"\\s+on\\s+${tablePat}`,
    "gi",
  );

  const dropRe = new RegExp(
    `drop\\s+policy(?:\\s+if\\s+exists)?\\s+"${policyName}"\\s+on\\s+${tablePat}`,
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
    const useCustomerAuth = readProjectFile("src/supabase/hooks/useCustomerAuth.js");

    expect(useCustomerAuth).toMatch(/supabase\.rpc\("link_customer_to_human"\)/);
    expect(useCustomerAuth).not.toMatch(/link_customer_to_human["'][^)]*p_phone/);
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
      expect(fn, `${path} uses the helper to check auth`).toMatch(
        /if\s*\(\s*!isAuthorizedWebhook\(/,
      );
      expect(fn, `${path} no longer compares WEBHOOK_SECRET with !==`).not.toMatch(
        /authHeader\s*!==\s*`Bearer\s*\$\{WEBHOOK_SECRET\}`/,
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

  it("retires the customer DELETE policy on bookings in favour of the UPDATE-to-cancel path", () => {
    // The original DELETE policy let customers hard-delete future bookings,
    // which bypasses cancel_reason capture and the notify-booking-cancelled
    // trigger (which fires on UPDATE, not DELETE). The intended path is
    // customer_cancel_own_bookings_update — keep that one, drop the DELETE.
    expect(finalPolicyState("customer_cancel_own_bookings", "bookings")).toBe(
      "dropped",
    );
    expect(
      finalPolicyState("customer_cancel_own_bookings_update", "bookings"),
    ).toBe("created");
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
});
