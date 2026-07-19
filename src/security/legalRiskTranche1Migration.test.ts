import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

function lastDefinitionOf(predicate: RegExp): string {
  const matches = getAllMigrationSqls().filter((sql) => predicate.test(sql));
  expect(matches.length, "expected at least one matching migration").toBeGreaterThan(0);
  return matches[matches.length - 1];
}

function finalPolicyState(
  policyName: string,
  table: string,
): "created" | "dropped" | "absent" {
  const tablePat = `(?:public\\.)?${table}`;
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

    for (const { kind } of events) state = kind;
  }

  return state;
}

function extractPolicy(sql: string, policyName: string, table: string): string {
  const start = sql.search(
    new RegExp(
      `create\\s+policy\\s+"?${policyName}"?\\s+on\\s+(?:public\\.)?${table}`,
      "i",
    ),
  );
  expect(start, `expected ${policyName} policy on ${table}`).toBeGreaterThanOrEqual(
    0,
  );
  const end = sql.indexOf(";", start);
  expect(end, `expected ${policyName} policy terminator`).toBeGreaterThan(start);
  return sql.slice(start, end + 1);
}

const latestMigration = readProjectFile(
  "supabase/migrations/20260712115759_legal_risk_tranche1.sql",
);

function extractFunction(sql: string, name: string): string {
  return extractDollarQuotedFunction(sql, name);
}

function extractDollarQuotedFunction(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${name}\\s*\\(`,
      "i",
    ),
  );
  expect(start, `expected ${name} definition`).toBeGreaterThanOrEqual(0);
  const tail = sql.slice(start);
  const delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i)?.[1];
  expect(delimiter, `expected ${name} dollar-quote delimiter`).toBeTruthy();
  const bodyStart = tail.indexOf(delimiter as string);
  const end = tail.indexOf(`${delimiter};`, bodyStart + (delimiter as string).length);
  expect(end, `expected ${name} closing delimiter`).toBeGreaterThan(bodyStart);
  return tail.slice(0, end + (delimiter as string).length + 1);
}

describe("Tranche 1 human write boundary", () => {
  it("leaves every broad customer humans UPDATE policy dropped", () => {
    expect(finalPolicyState("customer_update_own_human", "humans")).toBe(
      "dropped",
    );
    expect(finalPolicyState("combined_update_humans", "humans")).toBe(
      "dropped",
    );
  });

  it("recreates a staff-only humans UPDATE policy in the candidate migration", () => {
    expect(finalPolicyState("staff_update_humans", "humans")).toBe("created");

    const staffUpdate = extractPolicy(
      latestMigration,
      "staff_update_humans",
      "humans",
    );
    expect(staffUpdate).toMatch(/for\s+update\s+to\s+authenticated/i);
    expect(staffUpdate).toMatch(/using\s*\(\(select public\.is_staff\(\)\)\)/i);
    expect(staffUpdate).toMatch(
      /with\s+check\s*\(\(select public\.is_staff\(\)\)\)/i,
    );
    expect(staffUpdate).not.toMatch(/auth\.uid|customer_user_id/i);
  });

  it("exposes only narrow customer profile RPCs", () => {
    const contact = extractFunction(
      latestMigration,
      "update_customer_contact_details",
    );
    const completion = extractFunction(
      latestMigration,
      "complete_customer_profile",
    );
    expect(contact).toMatch(/update public\.humans/i);
    expect(completion).toMatch(/update public\.humans/i);
    expect(contact).toMatch(/auth\.uid\(\)/i);
    expect(completion).toMatch(/auth\.uid\(\)/i);
    expect(contact).not.toMatch(
      /approved_at|approved_by|source|signup_submitted_at|archived_at/i,
    );
    expect(completion).not.toMatch(
      /approved_by|source|signup_submitted_at|archived_at/i,
    );
  });

  it("preserves stored postcodes when a profile RPC receives no postcode", () => {
    const contact = extractFunction(
      latestMigration,
      "update_customer_contact_details",
    ).replace(/\s+/g, " ");
    const completion = extractFunction(
      latestMigration,
      "complete_customer_profile",
    ).replace(/\s+/g, " ");
    const preservingAssignment =
      "postcode = coalesce(nullif(upper(trim(coalesce(p_postcode, ''))), ''), h.postcode)";

    expect(contact).toContain(preservingAssignment);
    expect(completion).toContain(preservingAssignment);
  });

  it("routes both customer components through the narrow wrappers", () => {
    const profileGate = readProjectFile(
      "src/components/customer/onboarding/ProfileGate.jsx",
    );
    const dashboard = readProjectFile(
      "src/components/customer/CustomerDashboard.jsx",
    );

    expect(profileGate).toContain("completeCustomerProfile");
    expect(dashboard).toContain("updateCustomerContactDetails");
    expect(profileGate).not.toMatch(/\.from\(["']humans["']\)\s*\.update\(/);
    expect(dashboard).not.toMatch(/\.from\(["']humans["']\)\s*\.update\(/);
  });
});

describe("Tranche 1 dog size authority boundary", () => {
  it("leaves the raw customer dogs INSERT policy dropped", () => {
    expect(finalPolicyState("customer_insert_own_dogs", "dogs")).toBe(
      "dropped",
    );
  });

  it("stores customer-created sizes as reported values", () => {
    const createDog = extractFunction(
      lastDefinitionOf(
        /create\s+or\s+replace\s+function\s+public\.create_customer_dog/i,
      ),
      "create_customer_dog",
    );

    expect(createDog).toMatch(/reported_size/i);
  });

  it("does not let create_customer_dog populate authoritative size", () => {
    const createDog = extractFunction(
      lastDefinitionOf(
        /create\s+or\s+replace\s+function\s+public\.create_customer_dog/i,
      ),
      "create_customer_dog",
    );

    expect(createDog).not.toMatch(
      /insert into public\.dogs[^;]*\(name, breed, size,/i,
    );
  });

  it("does not accept booking JSON as a fallback for authoritative dog size", () => {
    const createBooking = extractFunction(
      lastDefinitionOf(
        /create\s+or\s+replace\s+function\s+public\.create_customer_booking_group/i,
      ),
      "create_customer_booking_group",
    );

    expect(createBooking).not.toMatch(
      /coalesce\([^;]*v_dog_size[^;]*v_in_size/i,
    );
  });

  it("serialises customer dog writes with approval and revalidates ownership", () => {
    const createDog = extractFunction(latestMigration, "create_customer_dog");
    const updateDog = extractFunction(latestMigration, "update_customer_dog");
    const approveSignup = extractFunction(
      latestMigration,
      "approve_customer_signup",
    );

    expect(createDog).toMatch(
      /from public\.humans h[\s\S]*?where h\.customer_user_id = v_uid[\s\S]*?for update/i,
    );
    expect(updateDog).toMatch(
      /from public\.humans h[\s\S]*?where h\.customer_user_id = v_uid[\s\S]*?for update/i,
    );
    expect(updateDog).toMatch(
      /update public\.dogs d[\s\S]*?where d\.id = p_dog_id\s+and d\.human_id = v_my_id/i,
    );

    const approvalLock = approveSignup.search(
      /from public\.humans h[\s\S]*?where h\.id = p_human_id[\s\S]*?for update/i,
    );
    const unconfirmedDogCheck = approveSignup.search(/from public\.dogs d/i);
    expect(approvalLock).toBeGreaterThanOrEqual(0);
    expect(unconfirmedDogCheck).toBeGreaterThan(approvalLock);
  });

  it("locks every owned dog before validating and inserting a booking group", () => {
    const createBooking = extractFunction(
      latestMigration,
      "create_customer_booking_group",
    );
    const dogLock = createBooking.search(
      /from public\.dogs d[\s\S]*?order by d\.id[\s\S]*?for update of d/i,
    );
    const insertLoop = createBooking.search(
      /for v_elem in select \* from jsonb_array_elements\(p_bookings\) loop/i,
    );

    expect(dogLock).toBeGreaterThanOrEqual(0);
    expect(insertLoop).toBeGreaterThan(dogLock);
  });

  it("normalises dog UUIDs before duplicate booking detection", () => {
    const createBooking = extractFunction(
      latestMigration,
      "create_customer_booking_group",
    );

    expect(createBooking).toMatch(
      /count\s*\(\s*distinct\s+nullif\s*\(\s*e->>'dog_id'\s*,\s*''\s*\)::uuid\s*\)/i,
    );
    expect(createBooking).toMatch(
      /when invalid_text_representation[\s\S]*?dog_id must be a valid UUID[\s\S]*?errcode\s*=\s*'22023'/i,
    );
  });

  it("reissues human merging with the shared deterministic lock order", () => {
    const mergeHumans = extractFunction(latestMigration, "merge_humans");
    const humanLocks = mergeHumans.search(
      /from public\.humans h[\s\S]*?order by h\.id[\s\S]*?for update/i,
    );
    const bookingLocks = mergeHumans.search(
      /from public\.bookings b[\s\S]*?order by b\.id[\s\S]*?for update of b/i,
    );
    const dogLocks = mergeHumans.search(
      /from public\.dogs d[\s\S]*?order by d\.id[\s\S]*?for update of d/i,
    );
    const firstMutation = mergeHumans.search(
      /update public\.(?:bookings|dogs)/i,
    );

    expect(humanLocks).toBeGreaterThanOrEqual(0);
    expect(bookingLocks).toBeGreaterThan(humanLocks);
    expect(dogLocks).toBeGreaterThan(bookingLocks);
    expect(firstMutation).toBeGreaterThan(dogLocks);
  });

  it("preserves every active communication opt-out when human records merge", () => {
    const mergeHumans = extractFunction(latestMigration, "merge_humans");

    for (const channel of ["sms", "whatsapp", "email"]) {
      expect(mergeHumans).toMatch(
        new RegExp(
          `${channel}_opted_out\\s*=\\s*w\\.${channel}_opted_out\\s+or\\s+l\\.${channel}_opted_out`,
          "i",
        ),
      );
      expect(mergeHumans).toMatch(
        new RegExp(
          `${channel}_opted_out_at\\s*=\\s*case[\\s\\S]*?w\\.${channel}_opted_out[\\s\\S]*?l\\.${channel}_opted_out[\\s\\S]*?w\\.${channel}_opted_out_at[\\s\\S]*?l\\.${channel}_opted_out_at[\\s\\S]*?end`,
          "i",
        ),
      );
      expect(mergeHumans).toMatch(
        new RegExp(
          `${channel}_opted_out_reason\\s*=\\s*case[\\s\\S]*?w\\.${channel}_opted_out[\\s\\S]*?l\\.${channel}_opted_out[\\s\\S]*?w\\.${channel}_opted_out_reason[\\s\\S]*?l\\.${channel}_opted_out_reason[\\s\\S]*?end`,
          "i",
        ),
      );
    }
  });

  it("normalises edited reported size into the customer model", () => {
    const dogsSection = readProjectFile(
      "src/components/customer/DogsSection.jsx",
    );

    expect(dogsSection).toMatch(
      /onSaved\(\{\s*\.\.\.dog,\s*\.\.\.row,\s*reportedSize:\s*row\.reported_size\s*\?\?\s*null\s*\}\)/,
    );
  });
});

describe("Tranche 1 trusted-contact creation boundary", () => {
  it("seeds the trusted-contact auth parent before the linked human", () => {
    const fixture = readProjectFile(
      "supabase/tests/120_trusted_contact_lock.test.sql",
    );
    const authParent = fixture.search(
      /insert\s+into\s+auth\.users\s*\(\s*id\s*\)\s*values\s*\(\s*'12000000-0000-4000-8000-000000000002'\s*\)\s*;/i,
    );
    const humanInserts =
      fixture.match(/insert\s+into\s+public\.humans\b[^;]*;/gi) ?? [];
    const humanInsert = humanInserts[0] ?? "";

    expect(humanInserts).toHaveLength(1);
    expect(humanInsert).toMatch(/\bcustomer_user_id\b/i);
    expect(humanInsert).toContain(
      "'12000000-0000-4000-8000-000000000002'",
    );
    expect(authParent).toBeGreaterThanOrEqual(0);
    expect(fixture.indexOf(humanInsert)).toBeGreaterThan(authParent);
  });

  it("drops the customer trusted-human creation function", () => {
    expect(latestMigration).toContain(
      "drop function if exists public.add_customer_trusted_human(text, text, text, text);",
    );
  });

  it("removes the customer trusted-human RPC wrapper", () => {
    const rpc = readProjectFile("src/supabase/rpc.ts");

    expect(rpc).not.toContain("addCustomerTrustedHuman");
    expect(rpc).not.toContain("add_customer_trusted_human");
  });

  it("removes trusted-human mutation wiring from the customer component", () => {
    const component = readProjectFile(
      "src/components/customer/TrustedHumansSection.jsx",
    );

    expect(component).not.toContain("addCustomerTrustedHuman");
    expect(component).not.toContain("add_customer_trusted_human");
  });

  it("exposes existing trusted contacts through a narrow customer read RPC", () => {
    const listTrusted = extractFunction(
      latestMigration,
      "list_customer_trusted_humans",
    );

    expect(listTrusted).toMatch(
      /returns\s+table\s*\(\s*id\s+uuid,\s*name\s+text,\s*surname\s+text,\s*phone\s+text,\s*relationship\s+text\s*\)/i,
    );
    expect(listTrusted).toMatch(/security\s+definer/i);
    expect(listTrusted).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
    expect(listTrusted).toMatch(/auth\.uid\(\)/i);
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.list_customer_trusted_humans\(\)\s+from\s+public;/i,
    );
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.list_customer_trusted_humans\(\)\s+from\s+anon;/i,
    );
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.list_customer_trusted_humans\(\)\s+from\s+authenticated;/i,
    );
    expect(latestMigration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.list_customer_trusted_humans\(\)\s+to\s+authenticated;/i,
    );
  });

  it("routes the dashboard through the typed trusted-contact read wrapper", () => {
    const rpc = readProjectFile("src/supabase/rpc.ts");
    const dashboard = readProjectFile(
      "src/components/customer/CustomerDashboard.jsx",
    );

    expect(rpc).toContain("export interface CustomerTrustedHumanRow");
    expect(rpc).toContain("listCustomerTrustedHumans");
    expect(rpc).toContain("list_customer_trusted_humans");
    expect(rpc).toMatch(
      /listCustomerTrustedHumans[\s\S]{0,300}overrideTypes<CustomerTrustedHumanRow\[\],\s*\{\s*merge:\s*false\s*\}>/,
    );
    expect(dashboard).toContain("listCustomerTrustedHumans");
    expect(dashboard).not.toContain('.from("human_trusted_contacts")');
  });

  it("does not pass a mutation callback to the read-only section", () => {
    const dashboard = readProjectFile(
      "src/components/customer/CustomerDashboard.jsx",
    );

    expect(dashboard).not.toMatch(
      /<TrustedHumansSection\b[^>]*\bonAdded\s*=/,
    );
  });
});

describe("Tranche 1 customer cancellation boundary", () => {
  it("leaves every customer-capable booking mutation policy dropped", () => {
    expect(
      finalPolicyState("customer_cancel_own_bookings_update", "bookings"),
    ).toBe("dropped");
    expect(finalPolicyState("customer_cancel_own_bookings", "bookings")).toBe(
      "dropped",
    );
    expect(finalPolicyState("combined_update_bookings", "bookings")).toBe(
      "dropped",
    );
    expect(finalPolicyState("combined_delete_bookings", "bookings")).toBe(
      "dropped",
    );
  });

  it("recreates staff-only booking mutation policies in the candidate migration", () => {
    expect(finalPolicyState("staff_update_bookings", "bookings")).toBe(
      "created",
    );
    expect(finalPolicyState("staff_delete_bookings", "bookings")).toBe(
      "created",
    );

    const staffUpdate = extractPolicy(
      latestMigration,
      "staff_update_bookings",
      "bookings",
    );
    expect(staffUpdate).toMatch(/for\s+update\s+to\s+authenticated/i);
    expect(staffUpdate).toMatch(/using\s*\(\(select public\.is_staff\(\)\)\)/i);
    expect(staffUpdate).toMatch(
      /with\s+check\s*\(\(select public\.is_staff\(\)\)\)/i,
    );
    expect(staffUpdate).not.toMatch(/auth\.uid|customer_user_id/i);

    const staffDelete = extractPolicy(
      latestMigration,
      "staff_delete_bookings",
      "bookings",
    );
    expect(staffDelete).toMatch(/for\s+delete\s+to\s+authenticated/i);
    expect(staffDelete).toMatch(/using\s*\(\(select public\.is_staff\(\)\)\)/i);
    expect(staffDelete).not.toMatch(/auth\.uid|customer_user_id/i);
  });

  it("exposes one narrow server-authoritative cancellation command", () => {
    const cancellation = extractFunction(
      latestMigration,
      "cancel_customer_booking",
    );

    expect(cancellation).toMatch(
      /cancel_customer_booking\s*\(\s*p_booking_id\s+uuid,\s*p_reason\s+text\s*\)/i,
    );
    expect(cancellation).toMatch(/security\s+definer/i);
    expect(cancellation).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
    expect(cancellation).toMatch(/auth\.uid\(\)/i);
    expect(cancellation).toMatch(/group_id/i);
    expect(cancellation).toMatch(/customerPortal/i);
    expect(cancellation).toMatch(/allowCancellations/i);
    expect(cancellation).toMatch(/minCancellationHours/i);
    expect(cancellation).toMatch(/Europe\/London/i);
    expect(cancellation).toMatch(/pg_advisory_xact_lock/i);
    expect(cancellation).toMatch(/for\s+update/i);
    expect(cancellation).toMatch(
      /b\.id\s*=\s*p_booking_id[\s\S]*?b\.group_id\s+is\s+not\s+distinct\s+from\s+v_group_id/i,
    );
    expect(cancellation).toMatch(/status\s*=\s*'Cancelled'/i);
    expect(cancellation).toMatch(/cancel_reason\s*=/i);
    expect(cancellation).toMatch(/errcode\s*=\s*'SDC01'/i);
    expect(cancellation).toMatch(/errcode\s*=\s*'SDC02'/i);
    expect(cancellation).toMatch(/errcode\s*=\s*'SDC03'/i);
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.cancel_customer_booking\(uuid,\s*text\)\s+from\s+public;/i,
    );
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.cancel_customer_booking\(uuid,\s*text\)\s+from\s+anon;/i,
    );
    expect(latestMigration).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.cancel_customer_booking\(uuid,\s*text\)\s+to\s+authenticated;/i,
    );
  });

  it("scopes a grouped cancellation to one stored visit date", () => {
    const cancellation = extractFunction(
      latestMigration,
      "cancel_customer_booking",
    );
    const datedScopes = cancellation.match(
      /b\.group_id\s*=\s*v_group_id\s+and\s+b\.booking_date\s*=\s*v_booking_date/gi,
    );

    expect(datedScopes?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(cancellation).toMatch(
      /b\.id\s*=\s*p_booking_id[\s\S]*?b\.group_id\s+is\s+not\s+distinct\s+from\s+v_group_id[\s\S]*?b\.booking_date\s+is\s+not\s+distinct\s+from\s+v_booking_date/i,
    );
  });

  it("locks the scoped dogs before cancellation ownership validation", () => {
    const cancellation = extractFunction(
      latestMigration,
      "cancel_customer_booking",
    );
    const bookingLock = cancellation.search(
      /from public\.bookings b[\s\S]*?order by b\.id[\s\S]*?for update/i,
    );
    const dogLock = cancellation.search(
      /from public\.dogs d\s+join public\.bookings b on b\.dog_id = d\.id[\s\S]*?order by d\.id[\s\S]*?for update of d/i,
    );
    const ownershipCheck = cancellation.search(
      /count\(\*\) filter \(where d\.human_id = v_human_id\)/i,
    );

    expect(bookingLock).toBeGreaterThanOrEqual(0);
    expect(dogLock).toBeGreaterThan(bookingLock);
    expect(ownershipCheck).toBeGreaterThan(dogLock);
  });

  it("fails closed when cancellation settings are not a singleton", () => {
    const cancellation = extractFunction(
      latestMigration,
      "cancel_customer_booking",
    );

    expect(cancellation).toMatch(
      /select\s+count\(\*\)::integer,\s+coalesce\(\s*\(array_agg\(sc\.settings order by sc\.id\)\)\[1\],\s*'\{\}'::jsonb\s*\)\s+into\s+v_settings_count,\s*v_settings\s+from public\.salon_config sc/i,
    );
    expect(cancellation).toMatch(
      /if v_settings_count > 1 then[\s\S]*?errcode\s*=\s*'SDC01'/i,
    );
  });

  it("replays the durable receipt for an identical committed cancellation", () => {
    const cancellation = extractFunction(
      latestMigration,
      "cancel_customer_booking",
    );
    const replayStart = cancellation.search(
      /-- BEGIN: durable cancellation receipt replay/i,
    );
    const targetResolve = cancellation.search(
      /-- Resolve only an owned target/i,
    );

    expect(latestMigration).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+smarter_dog_private\.customer_cancellation_receipts/i,
    );
    expect(latestMigration).toMatch(
      /cancelled_count\s+integer[\s\S]*?check\s*\(\s*cancelled_count\s*=\s*cardinality\(cancelled_booking_ids\)/i,
    );
    expect(latestMigration).toMatch(
      /revoke\s+all\s+on\s+table\s+smarter_dog_private\.customer_cancellation_receipts\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i,
    );
    expect(replayStart).toBeGreaterThanOrEqual(0);
    expect(targetResolve).toBeGreaterThan(replayStart);
    expect(cancellation).toMatch(
      /from\s+smarter_dog_private\.customer_cancellation_receipts\s+r[\s\S]*?r\.customer_user_id\s*=\s*v_uid[\s\S]*?r\.target_booking_id\s*=\s*p_booking_id[\s\S]*?r\.cancel_reason\s*=\s*v_reason/i,
    );
    expect(cancellation).toMatch(
      /r\.cancelled_at\s*=\s*\(\s*select\s+max\(cancellation_event\.occurred_at\)[\s\S]*?from\s+public\.booking_events\s+cancellation_event[\s\S]*?cancellation_event\.booking_id\s*=\s*p_booking_id[\s\S]*?cancellation_event\.event_type\s*=\s*'cancelled'/i,
    );
    expect(cancellation).toMatch(
      /select\s+count\(\*\)[\s\S]*?from\s+public\.booking_events\s+same_event[\s\S]*?same_event\.occurred_at\s*=\s*r\.cancelled_at[\s\S]*?=\s*1/i,
    );
    expect(cancellation).toMatch(
      /insert\s+into\s+smarter_dog_private\.customer_cancellation_receipts[\s\S]*?customer_user_id[\s\S]*?target_booking_id[\s\S]*?cancelled_booking_ids[\s\S]*?cancelled_count[\s\S]*?cancelled_at/i,
    );
    expect(cancellation).toMatch(
      /target_booking_id\s*:=\s*p_booking_id[\s\S]*?return\s+next;[\s\S]*?return;/i,
    );
  });

  it("preserves an existing staff override before non-staff sanitisation", () => {
    const capacity = extractFunction(
      latestMigration,
      "validate_booking_capacity",
    );
    const metadataReturn = capacity.search(
      /if\s+tg_op\s*=\s*'UPDATE'[\s\S]*?return\s+new;\s*end\s+if;/i,
    );
    const nonStaffClear = capacity.search(
      /if\s+not\s+v_is_staff\s+then\s+new\.staff_capacity_override\s*:=\s*false;/i,
    );

    expect(metadataReturn).toBeGreaterThanOrEqual(0);
    expect(nonStaffClear).toBeGreaterThan(metadataReturn);
  });

  it("serialises destination visit membership before metadata-only updates return", () => {
    const capacity = extractFunction(
      latestMigration,
      "validate_booking_capacity",
    );
    const membershipStart = capacity.search(
      /-- BEGIN: cancellation visit membership serialisation/i,
    );
    const metadataReturn = capacity.search(
      /if\s+tg_op\s*=\s*'UPDATE'[\s\S]*?return\s+new;\s*end\s+if;/i,
    );

    expect(membershipStart).toBeGreaterThanOrEqual(0);
    expect(metadataReturn).toBeGreaterThan(membershipStart);
    expect(capacity).toMatch(
      /tg_op\s*=\s*'INSERT'[\s\S]*?new\.group_id\s+is\s+distinct\s+from\s+old\.group_id[\s\S]*?new\.booking_date\s+is\s+distinct\s+from\s+old\.booking_date/i,
    );
    expect(capacity).toMatch(
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'customer_booking_cancellation\|'[\s\S]*?coalesce\(new\.group_id,\s*new\.id\)::text[\s\S]*?new\.booking_date::text[\s\S]*?,\s*0\s*\)\s*\)/i,
    );
  });

  it("rejects a non-cancelled row joining or reactivating a cancelled visit", () => {
    const capacity = extractFunction(
      latestMigration,
      "validate_booking_capacity",
    );

    expect(capacity).toMatch(
      /new\.group_id\s+is\s+not\s+null[\s\S]*?new\.status\s+is\s+distinct\s+from\s+'Cancelled'/i,
    );
    expect(capacity).toMatch(
      /tg_op\s*=\s*'UPDATE'[\s\S]*?old\.status\s*=\s*'Cancelled'[\s\S]*?exists\s*\([\s\S]*?from\s+public\.bookings\s+b[\s\S]*?b\.id\s*<>\s*new\.id[\s\S]*?b\.group_id\s*=\s*new\.group_id[\s\S]*?b\.booking_date\s*=\s*new\.booking_date[\s\S]*?b\.status\s*=\s*'Cancelled'/i,
    );
    expect(capacity).toMatch(/errcode\s*=\s*'SDC03'/i);
  });

  it("otherwise keeps the latest capacity trigger definition unchanged", () => {
    const priorSql = readProjectFile(
      "supabase/migrations/20260702170000_extra_slots_bookable.sql",
    );
    const prior = extractDollarQuotedFunction(
      priorSql,
      "validate_booking_capacity",
    );
    const expected = prior.replace(
      /(if\s+not\s+v_is_staff\s+then\s+new\.staff_capacity_override\s*:=\s*false;\s+end\s+if;)(\s*)(if\s+tg_op\s*=\s*'UPDATE'[\s\S]*?return\s+new;\s+end\s+if;)/i,
      "$3$2$1",
    );
    expect(expected).not.toBe(prior);

    const actual = extractDollarQuotedFunction(
      latestMigration,
      "validate_booking_capacity",
    );
    const withoutMembershipSerialisation = actual.replace(
      /\s*-- BEGIN: cancellation visit membership serialisation[\s\S]*?-- END: cancellation visit membership serialisation\s*/i,
      "\n\n",
    );
    expect(withoutMembershipSerialisation).not.toBe(actual);
    const normalise = (value: string) =>
      value
        .replace(/function\s+public\./gi, "function ")
        .replace(/\$function\$/g, "$$")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    expect(normalise(withoutMembershipSerialisation)).toBe(normalise(expected));
  });

  it("keeps cancellation narrow and routes rescheduling through one command", () => {
    const repo = readProjectFile(
      "src/supabase/repositories/bookingsRepo.ts",
    );
    const card = readProjectFile("src/components/customer/BookingCard.jsx");
    const wizard = readProjectFile(
      "src/components/customer/booking/BookingWizard.tsx",
    );

    expect(repo).toContain("cancelCustomerBooking");
    expect(repo).not.toContain("cancelMany");
    expect(repo).not.toContain("listIdsInGroup");
    expect(card).toContain("cancelCustomerBooking");
    expect(wizard).toContain("rescheduleCustomerBooking");
    expect(wizard).not.toContain("cancelCustomerBooking");
    expect(wizard).not.toContain("rescheduleFrom.groupId");
  });

  it("makes the dashboard refresh callback await the bookings reread", () => {
    const dashboard = readProjectFile(
      "src/components/customer/CustomerDashboard.jsx",
    );

    expect(dashboard).toMatch(
      /const\s+refreshBookings\s*=\s*useCallback\(async\s*\(\)\s*=>[\s\S]*?\.from\(["']bookings["']\)[\s\S]*?if\s*\([^)]*error[^)]*\)\s*throw/i,
    );
    expect(dashboard).not.toContain("setRefreshKey");
  });
});
