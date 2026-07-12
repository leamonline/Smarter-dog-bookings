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

const latestMigration = readProjectFile(
  "supabase/migrations/20260712115759_legal_risk_tranche1.sql",
);

function extractFunction(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,
      "i",
    ),
  );
  expect(start, `expected ${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end, `expected ${name} closing delimiter`).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
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
  it("leaves the broad customer humans UPDATE policy dropped", () => {
    expect(finalPolicyState("customer_update_own_human", "humans")).toBe(
      "dropped",
    );
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
  it("leaves broad customer booking updates dropped and staff updates intact", () => {
    expect(
      finalPolicyState("customer_cancel_own_bookings_update", "bookings"),
    ).toBe("dropped");
    expect(finalPolicyState("staff_update_bookings", "bookings")).toBe(
      "created",
    );
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
    const normalise = (value: string) =>
      value
        .replace(/function\s+public\./gi, "function ")
        .replace(/\$function\$/g, "$$")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    expect(normalise(actual)).toBe(normalise(expected));
  });

  it("removes client-side group discovery and raw cancellation updates", () => {
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
    expect(wizard).toContain("cancelCustomerBooking");
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
