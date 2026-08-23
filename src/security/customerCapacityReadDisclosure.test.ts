// What the customer capacity reads disclose — pinned, not described.
//
// WHY THIS EXISTS
//
// The customer booking wizard cannot read `bookings` or `day_settings`
// directly: RLS shows a customer only their own booking rows, and
// day_settings is staff-only. So the client capacity engine reads occupancy
// through four `SECURITY DEFINER` RPCs that deliberately bypass RLS. That is
// the correct design — the engine must see other customers' occupancy or it
// offers slots the database then refuses — but it means these four functions
// are the entire disclosure surface between the salon's booking data and any
// logged-in customer.
//
// Each is documented as minimal-disclosure. Those are comments, not tests
// (issue #667). A `SECURITY DEFINER` function is exactly where a later widened
// `select` or an added output column starts disclosing more than intended with
// nothing failing the build.
//
// This guard makes that surface reviewed instead of silent, following the
// pattern of the #661 bookings-column classification guard: every column each
// RPC returns is classified here, once, with a reason. Add a column to a
// `returns table(...)` and this test fails until someone states what it is and
// why a customer may see it. It asserts no runtime behaviour and changes none.
//
// It reads the LATEST definition of each function, not the first. Migrations
// apply in filename order and a later one can replace an earlier definition —
// the repository's headline landmine — so asserting against the original
// `create or replace` would be asserting against dead code. All three of
// `get_blocked_seats`, `get_occupancy_range` and `get_immediate_slots` were in
// fact replaced after their first migration.
//
// Writing this guard found a live gap: get_occupancy_range had no range cap
// at all while booking_policy_runtime() is inactive (the production state),
// unlike its sibling get_blocked_seats. Fixed in
// 20260822080000_cap_get_occupancy_range.sql, applied to both hosted
// projects the same day. See
// docs/architecture/decisions/007-customer-capacity-read-disclosure.md.
//
// Live verification (production `nlzhllhkigmsvrzduefz` and staging
// `btjnxvgkpdbfrrqxvkfj`, 22 August 2026): all four are SECURITY DEFINER,
// STABLE, `search_path=public, pg_temp`, and
// `has_function_privilege('anon', …, 'EXECUTE')` is false for every one; the
// deployed bodies match the migration text asserted below, and
// get_occupancy_range now raises `range too wide (max 92 days)` for a wide
// range on both projects while still returning a normal 28-day page.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const MIGRATIONS_DIR = join(root, "supabase/migrations");
const ADR = "docs/architecture/decisions/007-customer-capacity-read-disclosure.md";

const RPCS = [
  "get_slot_occupancy",
  "get_occupancy_range",
  "get_blocked_seats",
  "get_immediate_slots",
] as const;
type Rpc = (typeof RPCS)[number];

/**
 * Every column each RPC hands a logged-in customer, and why the booking
 * journey needs it. This is the disclosure surface: nothing else about a
 * booking, a dog, an owner or a staff setting crosses this boundary.
 */
const DISCLOSED: Record<Rpc, Record<string, string>> = {
  get_slot_occupancy: {
    slot: "which 30-minute slot an existing booking occupies — the seat the engine counts",
    size: "small/medium/large, because seat cost is size-dependent (a large dog can take the slot)",
  },
  get_occupancy_range: {
    booking_date: "which day the occupancy belongs to, so the date step can dim full days",
    slot: "as get_slot_occupancy",
    size: "as get_slot_occupancy",
  },
  get_blocked_seats: {
    setting_date: "which day the staff block applies to",
    slot: "which slot the block applies to",
    seat_index: "which of the slot's two seats staff blocked — a position, not a booking",
  },
  get_immediate_slots: {
    setting_date: "the SERVER's today (Europe/London), so the client never trusts the device clock",
    slot: "a slot staff flagged for same-day booking and that is still more than 30 minutes away",
  },
};

/**
 * Name parts that must never appear in one of these output columns. A column
 * carrying any of them identifies a person, a dog, a booking row or money —
 * none of which the capacity engine reads. Adding one is a deliberate act:
 * classifying it in DISCLOSED is not enough, this list has to change too.
 */
const NEVER_DISCLOSED_PARTS = new Set([
  "id", "ids", "uuid",
  "name", "names", "email", "phone", "mobile", "address", "postcode",
  "owner", "human", "customer", "dog", "breed",
  "note", "notes", "comment", "reason", "message",
  "price", "amount", "deposit", "payment", "reference",
  "status", "staff", "user",
]);

/**
 * How far each RPC lets one caller read in a single request. Recomputed from
 * the definitions below, so a cap that appears, moves or disappears fails this
 * test and forces the ADR to be updated with it.
 */
const RANGE_POSTURE: Record<Rpc, { args: string; cap: string }> = {
  get_slot_occupancy: { args: "p_date date", cap: "one date per call" },
  get_occupancy_range: {
    args: "p_from date, p_to date",
    cap: "92 days when booking_policy_runtime() is inactive — added by 20260822080000, see ADR 007",
  },
  get_blocked_seats: { args: "p_start date, p_end date", cap: "92 days" },
  get_immediate_slots: { args: "", cap: "today only, no parameters" },
};

const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Drop `--` prose so a grant discussed in a comment is never read as one. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

/** The definition that actually runs: the last one in filename (apply) order. */
function latestDefinition(rpc: Rpc): { file: string; body: string } {
  const opener = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}\\s*\\(`, "i");
  let found: { file: string; body: string } | null = null;

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const match = opener.exec(sql);
    if (!match) continue;
    const start = match.index;
    // A plpgsql body is delimited by $$ … $$; take through its terminator.
    const end = sql.indexOf("$$;", sql.indexOf("as $$", start));
    expect(end, `${rpc} in ${file} has no $$; terminator`).toBeGreaterThan(start);
    found = { file, body: sql.slice(start, end + 3) };
  }

  expect(found, `no definition of public.${rpc} found in any migration`).not.toBeNull();
  return found!;
}

/** The declared output columns — the contract Postgres enforces on the body. */
function returnedColumns(definition: string): string[] {
  const match = /returns\s+table\s*\(([^)]*)\)/is.exec(definition);
  expect(match, "definition has no returns table(...) clause").not.toBeNull();
  return match![1]
    .split(",")
    .map((column) => column.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function declaredArgs(definition: string, rpc: Rpc): string {
  const match = new RegExp(`function\\s+public\\.${rpc}\\s*\\(([^)]*)\\)`, "i").exec(definition);
  return (match?.[1] ?? "").trim().replace(/\s+/g, " ");
}

/** Every grant/revoke statement naming this function, across all migrations. */
function privilegeStatements(rpc: Rpc): Array<{ file: string; statement: string }> {
  const out: Array<{ file: string; statement: string }> = [];
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    for (const statement of sql.split(";")) {
      const normalised = statement.trim().replace(/\s+/g, " ").toLowerCase();
      if (!normalised.startsWith("grant") && !normalised.startsWith("revoke")) continue;
      if (!normalised.includes(`public.${rpc}(`) && !normalised.includes(`public.${rpc} (`)) continue;
      out.push({ file, statement: normalised });
    }
  }
  return out;
}

const definitions = Object.fromEntries(RPCS.map((rpc) => [rpc, latestDefinition(rpc)])) as Record<
  Rpc,
  { file: string; body: string }
>;

describe("customer capacity reads: what they disclose", () => {
  it.each(RPCS)("%s returns exactly the classified columns", (rpc) => {
    const columns = returnedColumns(definitions[rpc].body).sort();
    const classified = Object.keys(DISCLOSED[rpc]).sort();

    expect(
      columns,
      `public.${rpc} (latest definition: ${definitions[rpc].file}) no longer returns the ` +
        `classified column set. This function bypasses RLS and hands its result to any ` +
        `logged-in customer, so state what each new column is and why the booking journey ` +
        `needs it in DISCLOSED, and update ${ADR}.`,
    ).toEqual(classified);
  });

  it.each(RPCS)("%s discloses nothing that identifies a person, dog, row or payment", (rpc) => {
    for (const column of returnedColumns(definitions[rpc].body)) {
      const offending = column.split("_").filter((part) => NEVER_DISCLOSED_PARTS.has(part));
      expect(
        offending,
        `public.${rpc} returns "${column}", which reads as identifying data. The capacity ` +
          `engine needs occupancy shape only — a slot, a size, a seat position, a date. If ` +
          `this really is required, it is a privacy decision: record it in ${ADR} first.`,
      ).toEqual([]);
    }
  });
});

describe("customer capacity reads: security posture", () => {
  it.each(RPCS)("%s is SECURITY DEFINER with a pinned search_path", (rpc) => {
    const body = definitions[rpc].body.toLowerCase();
    // Definer rights are the point — the function exists to see rows the
    // caller cannot. That makes a pinned search_path mandatory rather than
    // tidy: without it the function resolves objects through the caller's path.
    expect(body, `${rpc} must be security definer`).toMatch(/security\s+definer/);
    expect(body, `${rpc} must pin search_path`).toMatch(/set\s+search_path\s*=\s*public/);
    expect(body, `${rpc} must be stable — it reads, it must never write`).toMatch(/\bstable\b/);
  });

  it.each(RPCS)("%s is never granted to anon", (rpc) => {
    const grantedToAnon = privilegeStatements(rpc).filter(
      (entry) => entry.statement.startsWith("grant") && /\banon\b/.test(entry.statement),
    );
    expect(
      grantedToAnon,
      `public.${rpc} bypasses RLS; a grant to anon would publish the salon's occupancy to ` +
        `the internet. Verified false in production on 22 August 2026.`,
    ).toEqual([]);
  });

  it.each(RPCS)("%s revokes anon and grants execute to authenticated in its latest definition", (rpc) => {
    const { file } = definitions[rpc];
    const here = privilegeStatements(rpc).filter((entry) => entry.file === file);

    expect(
      here.some((entry) => entry.statement.startsWith("revoke") && /\banon\b/.test(entry.statement)),
      `${file} must explicitly revoke ${rpc} from anon: Supabase auto-grants EXECUTE on new ` +
        `public functions to anon, so "revoke from public" alone leaves anon able to call it.`,
    ).toBe(true);

    expect(
      here.some(
        (entry) => entry.statement.startsWith("grant") && /\bauthenticated\b/.test(entry.statement),
      ),
      `${file} must grant execute on ${rpc} to authenticated — the booking wizard is ` +
        `login-gated and this is its only read path.`,
    ).toBe(true);
  });
});

describe("customer capacity reads: how much one call can harvest", () => {
  it.each(RPCS)("%s keeps its recorded parameter and range posture", (rpc) => {
    expect(
      declaredArgs(definitions[rpc].body, rpc),
      `public.${rpc}'s parameters changed, which changes how much one call can read`,
    ).toBe(RANGE_POSTURE[rpc].args);
  });

  it("get_blocked_seats still caps a request at 92 days", () => {
    expect(
      definitions.get_blocked_seats.body,
      "the 92-day cap is what stops the blocked-seat read being used to sweep the calendar",
    ).toMatch(/range too wide \(max 92 days\)/);
  });

  it("get_occupancy_range caps a request at 92 days, matching get_blocked_seats", () => {
    // Regression guard for the gap ADR 007 records: get_occupancy_range had no
    // unconditional range limit — not in its original definition, and not in
    // 20260726144001, which added the active-policy horizon check only inside
    // `if ... = 'active'`, with no `else`. With booking_policy_runtime()
    // inactive (the production state), that left zero bound: one authenticated
    // call could read the whole booking history's (date, slot, size). Fixed in
    // 20260822080000 by adding the same always-on 92-day fallback
    // get_blocked_seats already had. Remove the cap and this fails.
    expect(
      definitions.get_occupancy_range.body,
      "get_occupancy_range lost its 92-day fallback cap — the gap ADR 007 records as fixed " +
        "is back. Restore the else branch, or update ADR 007 and this test together if the " +
        "removal is deliberate.",
    ).toMatch(/range too wide \(max 92 days\)/);
    expect(
      definitions.get_occupancy_range.body,
      "the active-policy horizon check must still run first",
    ).toMatch(/booking_policy_runtime\(\)\s*=\s*'active'/);
  });

  it("get_immediate_slots takes no parameters and answers only for today", () => {
    const body = definitions.get_immediate_slots.body;
    expect(declaredArgs(body, "get_immediate_slots")).toBe("");
    expect(body, "today is computed server-side in Europe/London").toMatch(
      /now\(\)\s*at\s*time\s*zone\s*'Europe\/London'/i,
    );
  });
});

describe("customer capacity reads: the decision record", () => {
  it("names every RPC this guard covers", () => {
    const adr = read(ADR);
    for (const rpc of RPCS) {
      expect(adr, `${ADR} must describe what ${rpc} discloses`).toContain(rpc);
    }
  });

  it("records the gap that was found and the fix that closed it", () => {
    const adr = read(ADR);
    expect(adr, "must record the migration that added the cap").toContain(
      "20260822080000_cap_get_occupancy_range",
    );
    expect(adr, "must record the 92-day cap the fix added").toMatch(/92 day/i);
  });
});
