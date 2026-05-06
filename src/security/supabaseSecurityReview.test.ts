import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function fixMigration(): string {
  const migrationsDir = join(root, "supabase/migrations");
  const candidates = readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(migrationsDir, file), "utf8"))
    .filter((sql: string) => sql.includes("bookings_status_check") && sql.includes("demo_add_dog"));

  expect(candidates).toHaveLength(1);
  return candidates[0];
}

function allMigrationSql(): string {
  const migrationsDir = join(root, "supabase/migrations");
  return readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(migrationsDir, file), "utf8"))
    .join("\n\n");
}

function codexScanFixMigration(): string {
  const migrationsDir = join(root, "supabase/migrations");
  const candidates = readdirSync(migrationsDir)
    .filter((file: string) => file.endsWith(".sql"))
    .sort()
    .map((file: string) => readFileSync(join(migrationsDir, file), "utf8"))
    .filter((sql: string) => sql.includes("Fix Codex Security scan findings"));

  expect(candidates).toHaveLength(1);
  return candidates[0];
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

  it("does not runtime-cache authenticated Supabase API traffic in the PWA", () => {
    const viteConfig = readProjectFile("vite.config.js");

    expect(viteConfig).not.toContain('cacheName: "supabase-api"');
    expect(viteConfig).not.toMatch(/urlPattern:\s*\/\^https:\\\/\\\/\.\*\\\.supabase\\\.co/);
  });
});
