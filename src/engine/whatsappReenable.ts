// Switching WhatsApp back on for a number (#1016 follow-up): the pure rules
// behind the staff re-enable dialog, the profile notice and the inbox banner.
// No React, no client. The database owns every decision that matters (who is
// in scope, whether the note is long enough, whether the scope is still
// current); these helpers only prepare and explain the request, and must
// never be looser than the server.
import { phoneMatchKey } from "../../supabase/functions/_shared/optOut";

/** The server refuses a permission note shorter than this (after trimming). */
export const REENABLE_NOTE_MIN_LENGTH = 10;

/** humans.whatsapp_opted_out_reason when the number itself said STOP. */
export const STOP_REASON = "asked_on_whatsapp";

export const UNNAMED_RECORD = "Unnamed record";
export const DATE_NOT_RECORDED = "date not recorded";

/** One switched-off customer record on the number, as the scope read lists it. */
export interface OptOutRecord {
  id: string;
  /** "" for a record with no name (never null). */
  name: string;
  phone: string | null;
  reason: string | null;
  optedOutAt: string | null;
}

/** Everything a re-enable of one number would switch back on. */
export interface NumberOptOutScope {
  /** The number as it was asked about, verbatim. */
  phone: string;
  phoneKey: string;
  /** When the number first said STOP; null when it never did. */
  numberStoppedAt: string | null;
  /** When it last said STOP, as the server's own string (microseconds kept). */
  lastStopAt: string | null;
  records: OptOutRecord[];
}

/**
 * Counted in code points, after trimming every kind of whitespace. The server
 * trims spaces only before counting characters, so a note this accepts is
 * never one the server refuses.
 */
export function isPermissionNoteLongEnough(note: string | null | undefined): boolean {
  return Array.from((note ?? "").trim()).length >= REENABLE_NOTE_MIN_LENGTH;
}

export function optOutReasonLabel(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return "No reason recorded";
  if (trimmed === STOP_REASON) return "Said STOP on WhatsApp";
  return `Switched off: ${trimmed}`;
}

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

/** "3 Oct 2026, 14:05" in salon time, or null for a missing or invalid time. */
export function formatOptOutTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return LONDON_TIME.format(ms);
}

/** formatOptOutTime, with the copy for a time that was never recorded. */
export function optOutTimeLabel(iso: string | null | undefined): string {
  return formatOptOutTime(iso) ?? DATE_NOT_RECORDED;
}

export function recordDisplayName(record: Pick<OptOutRecord, "name">): string {
  return record.name.trim() || UNNAMED_RECORD;
}

/**
 * The same number however it is typed ("07700 900123", "+447700900123").
 * Two strings that are not phone numbers at all match only when they are
 * the same after trimming, so a cleared number never matches a real one.
 */
export function isSameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const keyA = phoneMatchKey(a);
  const keyB = phoneMatchKey(b);
  if (keyA !== null || keyB !== null) return keyA === keyB;
  return (a ?? "").trim() === (b ?? "").trim();
}

export type ReenableErrorKind =
  | "scope_changed"
  | "nothing_to_reenable"
  | "note_required"
  | "invalid_phone"
  | "not_staff"
  | "not_deployed"
  | "busy"
  | "network"
  | "unknown";

/** The P0001 DETAIL codes the two functions raise, and what each means here. */
export const REENABLE_DETAIL_KINDS: Readonly<Record<string, ReenableErrorKind>> = {
  reenable_scope_changed: "scope_changed",
  nothing_to_reenable: "nothing_to_reenable",
  permission_note_required: "note_required",
  invalid_phone: "invalid_phone",
};

// PGRST202: PostgREST cannot find the function; 42883: PostgreSQL cannot.
const NOT_DEPLOYED_CODES = new Set(["PGRST202", "42883"]);
// Deadlock, lock not available, serialisation failure, statement timeout:
// the transaction rolled back, so nothing was committed.
const BUSY_CODES = new Set(["40P01", "55P03", "40001", "57014"]);

/**
 * What went wrong, from the error's DETAIL first and its SQLSTATE second.
 * "network" means the outcome is unknown (the request may have committed);
 * "unknown" means the server answered with an error, so it rolled back.
 */
export function classifyReenableError(
  error: { code?: string | null; details?: string | null } | null | undefined,
  { thrown = false }: { thrown?: boolean } = {},
): ReenableErrorKind {
  if (thrown) return "network";
  const details = error?.details ?? "";
  if (Object.hasOwn(REENABLE_DETAIL_KINDS, details)) return REENABLE_DETAIL_KINDS[details];
  const code = error?.code ?? "";
  if (code === "42501") return "not_staff";
  if (NOT_DEPLOYED_CODES.has(code)) return "not_deployed";
  if (BUSY_CODES.has(code)) return "busy";
  if (!code) return "network";
  return "unknown";
}

type ScopeShape = Pick<NumberOptOutScope, "numberStoppedAt" | "lastStopAt" | "records">;

/** Nothing on the number is switched off: no record, and no STOP. */
export function isScopeEmpty(scope: ScopeShape | null | undefined): boolean {
  return (
    !scope ||
    (scope.records.length === 0 && scope.numberStoppedAt === null && scope.lastStopAt === null)
  );
}

export interface ScopeDiff {
  /** The number said STOP again since `prev` was read. */
  newStop: boolean;
  /** Names of records switched off since. */
  added: string[];
  /** Names of records no longer switched off on the number. */
  removed: string[];
  /** Nothing is switched off on the number any more. */
  cleared: boolean;
}

/**
 * What changed between two reads of the same number's scope. The latest STOP
 * is compared as the server's string, exactly as the re-enable will send it.
 * `leftNumber` (record ids) are left out of `removed`: they left the number
 * without being switched back on, and are named on their own instead.
 */
export function diffScopes(
  prev: ScopeShape | null | undefined,
  next: ScopeShape,
  leftNumber: readonly string[] = [],
): ScopeDiff {
  const prevRecords = prev?.records ?? [];
  const prevIds = new Set(prevRecords.map((record) => record.id));
  const nextIds = new Set(next.records.map((record) => record.id));
  const left = new Set(leftNumber);
  return {
    newStop: next.lastStopAt !== null && next.lastStopAt !== (prev?.lastStopAt ?? null),
    added: next.records.filter((record) => !prevIds.has(record.id)).map(recordDisplayName),
    removed: prevRecords
      .filter((record) => !nextIds.has(record.id) && !left.has(record.id))
      .map(recordDisplayName),
    cleared: isScopeEmpty(next),
  };
}

export function hasScopeChanges(diff: ScopeDiff): boolean {
  return diff.newStop || diff.cleared || diff.added.length > 0 || diff.removed.length > 0;
}

/** Milliseconds plus the microseconds Date.parse drops. */
function instant(iso: string): { ms: number; micros: number } | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(iso)?.[1] ?? "";
  return { ms, micros: Number(fraction.slice(3, 6).padEnd(3, "0")) };
}

/**
 * `a` is strictly later than `b`, compared to the microsecond (PostgreSQL's
 * precision; Date.parse alone stops at the millisecond). False when either
 * time is missing or unreadable: an unreadable time never proves anything.
 */
export function isStrictlyLater(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a ? instant(a) : null;
  const y = b ? instant(b) : null;
  if (!x || !y) return false;
  return x.ms !== y.ms ? x.ms > y.ms : x.micros > y.micros;
}

/**
 * The conversation list (kept live by realtime) shows a STOP later than the
 * one the dialog is showing. For display only: the value sent is always the
 * scope's own string.
 */
export function isNewerStop(observed: string | null | undefined, shown: string | null | undefined): boolean {
  if (!observed) return false;
  if (!shown) return true;
  return isStrictlyLater(observed, shown);
}

/** One whatsapp_opt_out_reenables row: a re-enable that went through. */
export interface AuditRow {
  id: string;
  /** Every record it switched back on. */
  humanIds: string[];
  /** Every conversation whose STOP it cleared. */
  conversationIds: string[];
  /** As stored: trimmed. */
  permissionNote: string;
  /** auth.uid() of the member of staff who did it. */
  reenabledBy: string;
  /** The server's own string (microseconds kept). */
  reenabledAt: string;
}

/**
 * The earliest time an audit row could prove anything about `scope`: its
 * earliest record switch-off or its latest STOP, whichever came first. Rows
 * at or before it cannot have switched any of it back on. Null when the
 * scope has no readable time at all.
 */
export function auditReadSince(scope: Pick<NumberOptOutScope, "records" | "lastStopAt">): string | null {
  let earliest: string | null = null;
  for (const at of [...scope.records.map((record) => record.optedOutAt), scope.lastStopAt]) {
    if (!at || !instant(at)) continue;
    if (earliest === null || isStrictlyLater(earliest, at)) earliest = at;
  }
  return earliest;
}

export interface ClearedAttributionInput {
  /** The scope staff were shown (and, after a submit, sent). */
  previous: NumberOptOutScope;
  /** The scope as just read again; null when it could not be. */
  next: NumberOptOutScope | null;
  /** whatsapp_opt_out_reenables rows for the number. */
  rows: readonly AuditRow[];
  /** The signed-in member of staff; null when no row can be this dialog's. */
  me: string | null;
  /** The note this dialog sent; null to accept any of `me`'s rows. */
  submittedNote: string | null;
}

export interface ClearedAttribution {
  /** Records no longer in scope that our own request switched back on. */
  byUs: string[];
  /** Records no longer in scope that another re-enable switched back on. */
  byOthers: string[];
  /** Records no longer in scope that no audit row proves were switched on. */
  leftNumber: string[];
  /** The row recording our own request, when it went through. */
  ourRow: AuditRow | null;
}

/**
 * `row` switched `record` back on after the switch-off staff were shown,
 * and after the latest STOP they were shown. A record with no switch-off
 * time cannot be proven: an old row would match it as well as a new one.
 */
function proves(row: AuditRow, record: OptOutRecord, lastStopAt: string | null): boolean {
  return (
    row.humanIds.includes(record.id) &&
    record.optedOutAt !== null &&
    isStrictlyLater(row.reenabledAt, record.optedOutAt) &&
    (lastStopAt === null || isStrictlyLater(row.reenabledAt, lastStopAt))
  );
}

/**
 * A number with no customer record: only a re-enable clears its STOP (a
 * stopped conversation cannot be moved to another number), so a row after
 * that STOP, clearing a conversation, cleared it.
 */
function provesNumber(row: AuditRow, lastStopAt: string | null): boolean {
  return lastStopAt !== null && row.conversationIds.length > 0 && isStrictlyLater(row.reenabledAt, lastStopAt);
}

/**
 * Why records staff were shown are no longer switched off on the number. A
 * record also leaves the scope when its phone changes while it stays opted
 * out (nothing but the audited re-enable clears an opt-out), so absence
 * alone never means "switched back on": only an audit row proves it.
 *
 * Candidates are the records in `previous` that `next` no longer lists (all
 * of them when `next` is empty or missing). Our row is a proving row by `me`
 * with the note we sent; it is reported even when the records are back in
 * `next` (it went through, and the number has said STOP again since).
 */
export function attributeCleared({
  previous,
  next,
  rows,
  me,
  submittedNote,
}: ClearedAttributionInput): ClearedAttribution {
  const { lastStopAt } = previous;
  const note = submittedNote === null ? null : submittedNote.trim();
  const provesAny = (row: AuditRow) =>
    previous.records.length > 0
      ? previous.records.some((record) => proves(row, record, lastStopAt))
      : provesNumber(row, lastStopAt);

  let ourRow: AuditRow | null = null;
  for (const row of rows) {
    if (me === null || row.reenabledBy !== me) continue;
    if (note !== null && row.permissionNote !== note) continue;
    if (!provesAny(row)) continue;
    if (ourRow === null || isStrictlyLater(row.reenabledAt, ourRow.reenabledAt)) ourRow = row;
  }

  const stillOff = new Set((next?.records ?? []).map((record) => record.id));
  const result: ClearedAttribution = { byUs: [], byOthers: [], leftNumber: [], ourRow };
  for (const record of previous.records) {
    if (stillOff.has(record.id)) continue;
    if (ourRow && proves(ourRow, record, lastStopAt)) result.byUs.push(record.id);
    else if (rows.some((row) => proves(row, record, lastStopAt))) result.byOthers.push(record.id);
    else result.leftNumber.push(record.id);
  }
  return result;
}

/** "Sarah", "Sarah and Tom", "Sarah, Tom and Bea". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The line for records that left the number without an audit row proving
 * they were switched back on: they are still switched off, wherever their
 * number is now. Null when there are none.
 */
export function leftNumberMessage(records: readonly Pick<OptOutRecord, "name">[]): string | null {
  if (records.length === 0) return null;
  const one = records.length === 1;
  return (
    `${joinNames(records.map(recordDisplayName))} ${one ? "isn’t" : "aren’t"} switched off on this number any ` +
    "more, but WhatsApp hasn’t been switched back on for them. " +
    (one
      ? "Their number may have changed — open their profile to check."
      : "Their numbers may have changed — open their profiles to check.")
  );
}

export type ConversationStopKind = "none" | "number_stop" | "record_off" | "record_other_number";

export interface ConversationStopInput {
  channel?: string | null;
  phone_e164?: string | null;
  human_id?: string | null;
  whatsapp_opted_out_at?: string | null;
  whatsapp_last_stop_at?: string | null;
  humans?: {
    name?: string | null;
    surname?: string | null;
    phone?: string | null;
    whatsapp_opted_out?: boolean | null;
    whatsapp_opted_out_at?: string | null;
    whatsapp_opted_out_reason?: string | null;
  } | null;
}

export interface ConversationStop {
  kind: ConversationStopKind;
  firstStopAt: string | null;
  lastStopAt: string | null;
  humanId: string | null;
  name: string | null;
  /** The linked customer's opt-out reason and time, when they are switched off. */
  reason: string | null;
  since: string | null;
  /** The linked customer is switched off, but under a different number. */
  linkedElsewhere: { id: string; name: string | null } | null;
}

/**
 * Why sends in this WhatsApp chat are refused, if they are:
 *  - number_stop: the number itself said STOP;
 *  - record_off: the linked customer is switched off on this number;
 *  - record_other_number: the linked customer is switched off, but their
 *    record has another number, so this number's re-enable cannot reach them.
 * whatsapp-send refuses for the linked customer as well as for the number, so
 * a number_stop names a linked customer saved elsewhere too.
 */
export function conversationWhatsappStop(conv: ConversationStopInput | null | undefined): ConversationStop {
  const none: ConversationStop = {
    kind: "none",
    firstStopAt: null,
    lastStopAt: null,
    humanId: null,
    name: null,
    reason: null,
    since: null,
    linkedElsewhere: null,
  };
  if (!conv || (conv.channel ?? "whatsapp") !== "whatsapp") return none;
  const human = conv.humans ?? null;
  const humanId = conv.human_id ?? null;
  const name =
    [human?.name, human?.surname]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" ") || null;
  const humanOff = humanId !== null && human?.whatsapp_opted_out === true;
  const humanKey = phoneMatchKey(human?.phone);
  const onThisNumber = humanKey !== null && humanKey === phoneMatchKey(conv.phone_e164);
  const firstStopAt = conv.whatsapp_opted_out_at ?? null;
  const stop: ConversationStop = {
    ...none,
    firstStopAt,
    lastStopAt: conv.whatsapp_last_stop_at ?? firstStopAt,
    humanId,
    name,
    reason: humanOff ? human?.whatsapp_opted_out_reason ?? null : null,
    since: humanOff ? human?.whatsapp_opted_out_at ?? null : null,
  };
  if (firstStopAt) {
    return {
      ...stop,
      kind: "number_stop",
      linkedElsewhere: humanOff && !onThisNumber && humanId ? { id: humanId, name } : null,
    };
  }
  if (humanOff) return { ...stop, kind: onThisNumber ? "record_off" : "record_other_number" };
  return { ...stop, kind: "none" };
}
