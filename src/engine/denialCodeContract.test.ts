// The reason-code contract (#665): what the gates EMIT must equal what the
// prose mapper would INFER.
//
// Migration 20260826120000 makes each booking gate state its reason in the
// exception's DETAIL. mapDenialReason still carries the message patterns as a
// documented fallback — for the two gates deliberately left bare, for the
// browser engine's own refusals (which never travel through PostgreSQL), and
// for a database that predates the migration.
//
// Two sources of truth for one fact is exactly the drift #665 exists to end,
// so this file pins them together: it reads the emitted codes straight out of
// the migration and checks each against the mapper, using the very message the
// gate raises alongside it.
//
// This is the test that would have caught the defect the migration fixes. The
// 30-minute cutoff refusal reads "Too close to the start time to book this
// online"; the mapper keyed the cutoff on the substring "same-day", which that
// message does not contain, so it fell through to `unknown` — and #681 makes
// `unknown` fail closed, denying those customers the alternative times that
// past_cutoff exists to offer.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DENIAL_REASON_LABELS, mapDenialReason } from "./denials";

/**
 * The migrations that define emitted codes, in apply order. A later migration
 * redefines a gate, so for any message it raises, its code is the effective
 * contract — exactly how PostgreSQL resolves the same sequence.
 */
const MIGRATIONS = [
  "../../supabase/migrations/20260826120000_gate_reason_codes.sql",
  "../../supabase/migrations/20260830120000_seat_blocked_reason.sql",
].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));

/**
 * Sites where the EMITTED code deliberately diverges from what the prose
 * mapper infers. The prose inference is kept as the documented fallback for a
 * database predating the migration; wherever the migration is applied, the
 * emitted code wins. Owner decision, 30 Aug 2026, recorded on #665.
 */
const DELIBERATE_PROSE_DIVERGENCES: Record<string, string> = {
  // The slot is staff-blocked; the day is not closed. Emits seat_blocked
  // (retryable — the Flow offers other same-day times); the wording still
  // reads "closed", so prose alone infers calendar_closed.
  "That time slot is closed on this date": "calendar_closed",
};

interface EmittedRaise {
  message: string;
  code: string;
}

/** Walk a `raise exception ... ;` statement, respecting quoted literals. */
function raiseStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /raise\s+exception/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    let i = m.index + m[0].length;
    while (i < sql.length) {
      const c = sql[i];
      if (c === "'") {
        i += 1;
        while (i < sql.length) {
          if (sql[i] === "'") {
            if (sql[i + 1] === "'") { i += 2; continue; }
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      if (c === ";") break;
      i += 1;
    }
    out.push(sql.slice(m.index, i));
  }
  return out;
}

/**
 * The human message a raise carries.
 *
 * Two shapes appear in these gates. Most raise the message positionally
 * (`raise exception 'Slot is full' using ...`); the pregnancy and slot-block
 * gates name it instead (`raise exception using errcode = 'P0001', message =
 * '...'`). Reading the first literal blindly returns 'P0001' for the second
 * shape, so the named form is preferred and the option literals are stripped
 * before falling back to position.
 */
function firstMessage(stmt: string): string | null {
  const named = stmt.match(/message\s*=\s*'((?:[^']|'')*)'/);
  if (named) return named[1].replace(/''/g, "'");
  const positional = stmt
    .replace(/detail\s*=\s*'[a-z_0-9]+'/g, "")
    .replace(/errcode\s*=\s*'[A-Z0-9]+'/g, "")
    .match(/'((?:[^']|'')*)'/);
  return positional ? positional[1].replace(/''/g, "'") : null;
}

function emittedRaisesIn(path: string): EmittedRaise[] {
  const sql = readFileSync(path, "utf8");
  const rows: EmittedRaise[] = [];
  for (const stmt of raiseStatements(sql)) {
    const code = stmt.match(/detail\s*=\s*'([a-z_0-9]+)'/);
    if (!code) continue;
    const message = firstMessage(stmt);
    if (!message) continue;
    rows.push({ message, code: code[1] });
  }
  return rows;
}

/** The effective contract: later migrations override earlier, per message. */
function emittedRaises(): EmittedRaise[] {
  const byMessage = new Map<string, EmittedRaise>();
  for (const path of MIGRATIONS) {
    for (const row of emittedRaisesIn(path)) byMessage.set(row.message, row);
  }
  return [...byMessage.values()];
}

describe("gate reason codes agree with the prose mapper", () => {
  const raises = emittedRaises();

  it("reads every emitted code out of the migrations", () => {
    // 26 raise sites in the base migration collapse to 22 distinct messages
    // (some wording is shared across gates); the 20260830 re-issue of the
    // calendar gate carries the same six messages, so the effective contract
    // stays at 22 — the re-issue adds nothing and loses nothing.
    expect(emittedRaisesIn(MIGRATIONS[0]).length).toBe(26);
    expect(emittedRaisesIn(MIGRATIONS[1]).length).toBe(6);
    expect(raises.length).toBe(22);
  });

  it("lets the re-issue change ONLY the code it exists to change", () => {
    // The strongest property of the layering: for every message, the
    // effective code equals the base migration's code except at the one site
    // the 20260830 migration reclassifies. A re-issue that drifted any other
    // site would fail here by name.
    const base = new Map(emittedRaisesIn(MIGRATIONS[0]).map((r) => [r.message, r.code]));
    const changed = raises
      .filter((r) => base.get(r.message) !== r.code)
      .map((r) => `${r.message} → ${r.code}`);
    expect(changed).toEqual(["That time slot is closed on this date → seat_blocked"]);
  });

  it("emits only codes that are in the vocabulary", () => {
    const unknown = raises
      .map((r) => r.code)
      .filter((c) => !Object.prototype.hasOwnProperty.call(DENIAL_REASON_LABELS, c));
    expect(unknown).toEqual([]);
  });

  it("never emits the catch-all", () => {
    // `unknown` means "the mapper could not tell". A gate that knows its own
    // reason must never claim that.
    expect(raises.filter((r) => r.code === "unknown")).toEqual([]);
  });

  it.each(emittedRaises().map((r) => [r.code, r.message] as const))(
    "%s ← %s",
    (code, message) => {
      const proseFallback = DELIBERATE_PROSE_DIVERGENCES[message];
      if (proseFallback) {
        // A documented divergence: the prose fallback stays put for databases
        // predating the migration, and the emitted code wins where it applies.
        // Anywhere else, silent disagreement is still a failure.
        expect(mapDenialReason(message)).toBe(proseFallback);
        expect(mapDenialReason(message, code)).toBe(code);
        return;
      }
      // The mapper, given only the prose, must reach the code the gate emits.
      // A disagreement means one of the two is wrong, and silently so.
      expect(mapDenialReason(message)).toBe(code);
    },
  );

  it("reclassifies both-seats-blocked as seat_blocked in the effective contract", () => {
    // Owner decision, 30 Aug 2026 (#665): the slot is blocked, the day is not
    // closed. seat_blocked is retryable, so the Flow offers other same-day
    // times instead of claiming the salon is shut.
    const site = raises.find(
      (r) => r.message === "That time slot is closed on this date",
    );
    expect(site?.code).toBe("seat_blocked");
  });

  it("prefers the emitted code over the prose when they disagree", () => {
    // The whole point of the contract: the gate's own answer wins.
    expect(mapDenialReason("Slot is full", "large_dog_ineligible")).toBe(
      "large_dog_ineligible",
    );
  });

  it("ignores a DETAIL that is not one of our codes", () => {
    // DETAIL is a general-purpose PostgreSQL field. Anything that is not a
    // known code must fall through to the prose rather than invent a category.
    expect(mapDenialReason("Slot is full", "some other detail text")).toBe("slot_full");
    expect(mapDenialReason("Slot is full", "")).toBe("slot_full");
    expect(mapDenialReason("Slot is full", null)).toBe("slot_full");
  });

  it("keeps the cutoff refusal retryable rather than failing closed", () => {
    // The defect this contract found. past_cutoff is retryable because a later
    // slot today can still be far enough out; `unknown` is not.
    expect(
      mapDenialReason("Too close to the start time to book this online — please give us a ring"),
    ).toBe("past_cutoff");
  });
});
