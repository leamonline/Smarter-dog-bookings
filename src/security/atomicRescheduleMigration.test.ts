import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");

function atomicRescheduleMigration(): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse();
  const fileIndex = files.findIndex((name) =>
    readFileSync(join(migrationsDir, name), "utf8").includes(
      "function public.reschedule_customer_booking",
    ),
  );
  const file = files[fileIndex];

  expect(file, "expected an atomic customer reschedule migration").toBeTruthy();
  const latest = readFileSync(join(migrationsDir, file as string), "utf8");

  // A later safety wrapper may delegate ordinary visits to a renamed,
  // browser-revoked copy of the original atomic implementation. Inspect both
  // halves so this regression test still proves cancellation, replacement,
  // receipts and public grants as one reachable command chain.
  if (latest.includes("reschedule_customer_booking_direct_unchecked")) {
    const implementationFile = files.slice(fileIndex + 1).find((name) => {
      const sql = readFileSync(join(migrationsDir, name), "utf8");
      return (
        sql.includes("function public.reschedule_customer_booking") &&
        sql.includes("public.cancel_customer_booking(") &&
        sql.includes("public.create_customer_booking_group(")
      );
    });
    expect(
      implementationFile,
      "expected the delegated atomic reschedule implementation",
    ).toBeTruthy();
    return `${latest}\n${readFileSync(
      join(migrationsDir, implementationFile as string),
      "utf8",
    )}`;
  }

  return latest;
}

describe("atomic customer rescheduling", () => {
  it("cancels the old visit and creates the replacement in one database command", () => {
    const sql = atomicRescheduleMigration();
    const cancellation = sql.indexOf("public.cancel_customer_booking(");
    const replacement = sql.indexOf("public.create_customer_booking_group(");

    expect(sql).toMatch(
      /create\s+or\s+replace\s+function\s+public\.reschedule_customer_booking\s*\(/i,
    );
    expect(sql).toMatch(/security\s+definer/i);
    expect(cancellation).toBeGreaterThanOrEqual(0);
    expect(replacement).toBeGreaterThan(cancellation);
    expect(sql).toMatch(/raise\s+exception[\s\S]*replacement_booking_count_mismatch/i);
    expect(sql).toMatch(/cancelled_booking_ids/i);
    expect(sql).toMatch(/v_original_dog_ids\s+is\s+distinct\s+from\s+v_replacement_dog_ids/i);
    expect(sql).toMatch(/replacement_visit_mismatch[\s\S]*errcode\s*=\s*'SDC04'/i);
  });

  it("exposes the command only to authenticated customers", () => {
    const sql = atomicRescheduleMigration();

    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.reschedule_customer_booking\(uuid,\s*jsonb,\s*date,\s*text\)\s+from\s+public,\s*anon,\s*service_role/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.reschedule_customer_booking\(uuid,\s*jsonb,\s*date,\s*text\)\s+to\s+authenticated/i,
    );
  });

  it("stores and replays an exact committed reschedule", () => {
    const sql = atomicRescheduleMigration();
    const replayLookup = sql.indexOf("customer_reschedule_receipts");
    const cancellation = sql.indexOf("public.cancel_customer_booking(");

    expect(sql).toMatch(
      /create\s+table[\s\S]*smarter_dog_private\.customer_reschedule_receipts/i,
    );
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/v_uid\s+uuid\s*:=\s*\(select\s+auth\.uid\(\)\)/i);
    expect(replayLookup).toBeGreaterThanOrEqual(0);
    expect(replayLookup).toBeLessThan(cancellation);
    expect(sql).toMatch(
      /insert\s+into\s+smarter_dog_private\.customer_reschedule_receipts/i,
    );
    expect(sql).toMatch(/replacement_booking_ids/i);
  });

  it("binds the cancellation result to the source visit that was resolved", () => {
    const sql = atomicRescheduleMigration();

    expect(sql).toMatch(/v_expected_booking_ids\s+uuid\[\]/i);
    expect(sql).toMatch(
      /v_cancelled_booking_ids\s+is\s+distinct\s+from\s+v_expected_booking_ids/i,
    );
    expect(sql).toMatch(
      /v_cancelled_group_id\s+is\s+distinct\s+from\s+v_original_group_id/i,
    );
    expect(sql).toMatch(/v_cancelled_scope_matches/i);
  });
});
