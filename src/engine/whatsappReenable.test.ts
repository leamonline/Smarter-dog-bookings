import { describe, expect, it } from "vitest";
import {
  DATE_NOT_RECORDED,
  REENABLE_NOTE_MIN_LENGTH,
  attributeCleared,
  auditReadSince,
  classifyReenableError,
  conversationWhatsappStop,
  diffScopes,
  formatOptOutTime,
  hasScopeChanges,
  isNewerStop,
  isPermissionNoteLongEnough,
  isSameNumber,
  isScopeEmpty,
  isStrictlyLater,
  joinNames,
  leftNumberMessage,
  optOutReasonLabel,
  optOutTimeLabel,
  recordDisplayName,
  type AuditRow,
  type NumberOptOutScope,
  type OptOutRecord,
} from "./whatsappReenable";

const SARAH = "11111111-1111-4111-8111-111111111111";
const TOM = "22222222-2222-4222-8222-222222222222";

function scope(overrides: Partial<NumberOptOutScope> = {}): NumberOptOutScope {
  return {
    phone: "+447700900123",
    phoneKey: "7700900123",
    numberStoppedAt: "2026-10-03T13:05:00.123456+00:00",
    lastStopAt: "2026-10-03T13:05:00.123456+00:00",
    records: [
      { id: SARAH, name: "Sarah Jones", phone: "07700 900123", reason: "asked_on_whatsapp", optedOutAt: null },
    ],
    ...overrides,
  };
}

describe("isPermissionNoteLongEnough", () => {
  it("needs ten characters", () => {
    expect(REENABLE_NOTE_MIN_LENGTH).toBe(10);
    expect(isPermissionNoteLongEnough("123456789")).toBe(false);
    expect(isPermissionNoteLongEnough("1234567890")).toBe(true);
  });

  it("does not count leading or trailing spaces and newlines", () => {
    expect(isPermissionNoteLongEnough("   123456789   ")).toBe(false);
    expect(isPermissionNoteLongEnough("\n\t123456789\n")).toBe(false);
    expect(isPermissionNoteLongEnough("  Rang today  ")).toBe(true);
  });

  it("is false for whitespace only, null and undefined", () => {
    expect(isPermissionNoteLongEnough("           ")).toBe(false);
    expect(isPermissionNoteLongEnough(null)).toBe(false);
    expect(isPermissionNoteLongEnough(undefined)).toBe(false);
  });

  it("counts code points, as the server counts characters", () => {
    // Five emoji are ten UTF-16 code units but five characters.
    expect("🐶🐶🐶🐶🐶".length).toBe(10);
    expect(isPermissionNoteLongEnough("🐶🐶🐶🐶🐶")).toBe(false);
    expect(isPermissionNoteLongEnough("🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶")).toBe(true);
  });
});

describe("optOutReasonLabel", () => {
  it("names each reason", () => {
    expect(optOutReasonLabel("asked_on_whatsapp")).toBe("Said STOP on WhatsApp");
    expect(optOutReasonLabel(null)).toBe("No reason recorded");
    expect(optOutReasonLabel(undefined)).toBe("No reason recorded");
    expect(optOutReasonLabel("")).toBe("No reason recorded");
    expect(optOutReasonLabel("   ")).toBe("No reason recorded");
    expect(optOutReasonLabel("Asked by phone")).toBe("Switched off: Asked by phone");
  });
});

describe("formatOptOutTime", () => {
  it("shows salon time in British Summer Time, microseconds and all", () => {
    expect(formatOptOutTime("2026-10-03T13:05:00.123456+00:00")).toBe("3 Oct 2026, 14:05");
  });

  it("shows salon time in Greenwich Mean Time", () => {
    expect(formatOptOutTime("2026-12-01T09:00:00+00:00")).toBe("1 Dec 2026, 09:00");
  });

  it("is null for a missing or invalid time", () => {
    expect(formatOptOutTime(null)).toBeNull();
    expect(formatOptOutTime(undefined)).toBeNull();
    expect(formatOptOutTime("")).toBeNull();
    expect(formatOptOutTime("not a time")).toBeNull();
  });

  it("falls back to the copy for a time never recorded", () => {
    expect(optOutTimeLabel(null)).toBe(DATE_NOT_RECORDED);
    expect(optOutTimeLabel("nonsense")).toBe("date not recorded");
    expect(optOutTimeLabel("2026-12-01T09:00:00+00:00")).toBe("1 Dec 2026, 09:00");
  });
});

describe("recordDisplayName", () => {
  it("names a record with no name", () => {
    expect(recordDisplayName({ name: "" })).toBe("Unnamed record");
    expect(recordDisplayName({ name: "  " })).toBe("Unnamed record");
    expect(recordDisplayName({ name: "Sarah Jones" })).toBe("Sarah Jones");
  });
});

describe("isSameNumber", () => {
  it("matches one number however it is typed", () => {
    expect(isSameNumber("07700 900123", "+447700900123")).toBe(true);
    expect(isSameNumber("07700900123", "0044 7700 900123")).toBe(true);
    expect(isSameNumber("+33 6 12 34 56 78", "0033612345678")).toBe(true);
  });

  it("tells different numbers apart, and a cleared number from a real one", () => {
    expect(isSameNumber("07700 900123", "07700 900456")).toBe(false);
    expect(isSameNumber("07700 900123", "")).toBe(false);
    expect(isSameNumber(null, "07700 900123")).toBe(false);
  });

  it("compares strings that are not phone numbers as typed", () => {
    expect(isSameNumber("", "  ")).toBe(true);
    expect(isSameNumber(null, undefined)).toBe(true);
    expect(isSameNumber("12", "12")).toBe(true);
    expect(isSameNumber("12", "34")).toBe(false);
  });
});

describe("classifyReenableError", () => {
  it("reads the DETAIL code first", () => {
    expect(classifyReenableError({ code: "P0001", details: "reenable_scope_changed" })).toBe("scope_changed");
    expect(classifyReenableError({ code: "P0001", details: "nothing_to_reenable" })).toBe("nothing_to_reenable");
    expect(classifyReenableError({ code: "P0001", details: "permission_note_required" })).toBe("note_required");
    expect(classifyReenableError({ code: "P0001", details: "invalid_phone" })).toBe("invalid_phone");
  });

  it("then the SQLSTATE", () => {
    expect(classifyReenableError({ code: "42501", details: null })).toBe("not_staff");
    expect(classifyReenableError({ code: "PGRST202", details: "Searched for the function" })).toBe("not_deployed");
    expect(classifyReenableError({ code: "42883" })).toBe("not_deployed");
  });

  it("treats a rolled-back lock or timeout as busy", () => {
    for (const code of ["40P01", "55P03", "40001", "57014"]) {
      expect(classifyReenableError({ code, details: null })).toBe("busy");
    }
  });

  it("treats a missing answer as an unknown outcome", () => {
    expect(classifyReenableError({ code: "", details: "TypeError: Failed to fetch" })).toBe("network");
    expect(classifyReenableError({ code: null })).toBe("network");
    expect(classifyReenableError(null)).toBe("network");
    expect(classifyReenableError({ code: "P0001", details: "reenable_scope_changed" }, { thrown: true })).toBe("network");
  });

  it("treats any other server error as rolled back", () => {
    expect(classifyReenableError({ code: "P0001", details: "something_else" })).toBe("unknown");
    expect(classifyReenableError({ code: "23514", details: null })).toBe("unknown");
    // An inherited property name is not a detail code.
    expect(classifyReenableError({ code: "P0001", details: "toString" })).toBe("unknown");
  });
});

describe("isScopeEmpty", () => {
  it("is empty only with no record and no STOP", () => {
    expect(isScopeEmpty(null)).toBe(true);
    expect(isScopeEmpty(scope({ records: [], numberStoppedAt: null, lastStopAt: null }))).toBe(true);
    expect(isScopeEmpty(scope({ records: [] }))).toBe(false);
    expect(isScopeEmpty(scope({ numberStoppedAt: null, lastStopAt: null }))).toBe(false);
  });
});

describe("diffScopes", () => {
  it("treats a first STOP after none as a new STOP", () => {
    const diff = diffScopes(scope({ numberStoppedAt: null, lastStopAt: null }), scope());
    expect(diff.newStop).toBe(true);
    expect(hasScopeChanges(diff)).toBe(true);
  });

  it("treats a later microsecond string as a new STOP", () => {
    const diff = diffScopes(scope(), scope({ lastStopAt: "2026-10-03T13:05:00.123457+00:00" }));
    expect(diff.newStop).toBe(true);
  });

  it("finds nothing when the string is the same", () => {
    const diff = diffScopes(scope(), scope());
    expect(diff).toEqual({ newStop: false, added: [], removed: [], cleared: false });
    expect(hasScopeChanges(diff)).toBe(false);
  });

  it("names records added and removed", () => {
    const prev = scope();
    const next = scope({
      records: [{ id: TOM, name: "", phone: "07700900123", reason: "Asked by phone", optedOutAt: null }],
    });
    const diff = diffScopes(prev, next);
    expect(diff.added).toEqual(["Unnamed record"]);
    expect(diff.removed).toEqual(["Sarah Jones"]);
    expect(diff.newStop).toBe(false);
    expect(hasScopeChanges(diff)).toBe(true);
  });

  it("treats a missing previous scope as nothing seen", () => {
    expect(diffScopes(null, scope()).added).toEqual(["Sarah Jones"]);
  });

  it("notices a number cleared in the meantime", () => {
    const diff = diffScopes(scope(), scope({ records: [], numberStoppedAt: null, lastStopAt: null }));
    expect(diff.cleared).toBe(true);
    expect(diff.newStop).toBe(false);
    expect(diff.removed).toEqual(["Sarah Jones"]);
    expect(hasScopeChanges({ newStop: false, added: [], removed: [], cleared: true })).toBe(true);
  });
});

describe("diffScopes with records that left the number", () => {
  it("leaves them out of removed, so they are named once", () => {
    const tom = { id: TOM, name: "Tom Jones", phone: null, reason: null, optedOutAt: null };
    const prev = scope({ records: [...scope().records, tom] });
    expect(diffScopes(prev, scope({ records: [] }), [TOM]).removed).toEqual(["Sarah Jones"]);
    expect(diffScopes(prev, scope({ records: [] })).removed).toEqual(["Sarah Jones", "Tom Jones"]);
  });
});

describe("isNewerStop", () => {
  it("is false with nothing observed", () => {
    expect(isNewerStop(null, "2026-10-03T13:05:00.123456+00:00")).toBe(false);
    expect(isNewerStop(undefined, null)).toBe(false);
  });

  it("is true when the dialog shows no STOP at all", () => {
    expect(isNewerStop("2026-10-03T13:05:00.123456+00:00", null)).toBe(true);
  });

  it("compares instants to the microsecond", () => {
    const shown = "2026-10-03T13:05:00.123456+00:00";
    expect(isNewerStop("2026-10-03T13:05:00.123457+00:00", shown)).toBe(true);
    expect(isNewerStop("2026-10-03T13:05:00.124+00:00", shown)).toBe(true);
    expect(isNewerStop(shown, shown)).toBe(false);
    expect(isNewerStop("2026-10-03T13:05:00.123455+00:00", shown)).toBe(false);
    expect(isNewerStop("2026-10-03T13:04:59+00:00", shown)).toBe(false);
  });

  it("compares the instant, not the offset spelling", () => {
    expect(isNewerStop("2026-10-03T14:05:01+01:00", "2026-10-03T13:05:00+00:00")).toBe(true);
    expect(isNewerStop("2026-10-03T14:05:00+01:00", "2026-10-03T13:05:00+00:00")).toBe(false);
  });

  it("is false for an unreadable time", () => {
    expect(isNewerStop("nonsense", "2026-10-03T13:05:00+00:00")).toBe(false);
  });
});

describe("conversationWhatsappStop", () => {
  const base = {
    channel: "whatsapp",
    phone_e164: "+447700900123",
    human_id: "human-1",
    whatsapp_opted_out_at: null as string | null,
    whatsapp_last_stop_at: null as string | null,
    humans: {
      name: "Sarah",
      surname: "Jones",
      phone: "07700 900123",
      whatsapp_opted_out: false,
      whatsapp_opted_out_at: null as string | null,
      whatsapp_opted_out_reason: null as string | null,
    },
  };

  it("is none for an SMS thread, even one that said STOP", () => {
    const stop = conversationWhatsappStop({
      ...base,
      channel: "sms",
      whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00",
    });
    expect(stop.kind).toBe("none");
    expect(conversationWhatsappStop(null).kind).toBe("none");
  });

  it("is none when nothing is switched off", () => {
    expect(conversationWhatsappStop(base)).toMatchObject({ kind: "none", humanId: "human-1", name: "Sarah Jones" });
  });

  it("reports the number's first and latest STOP", () => {
    const stop = conversationWhatsappStop({
      ...base,
      human_id: null,
      humans: null,
      whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00",
      whatsapp_last_stop_at: "2026-10-10T08:12:00+00:00",
    });
    expect(stop).toMatchObject({
      kind: "number_stop",
      firstStopAt: "2026-10-03T13:05:00+00:00",
      lastStopAt: "2026-10-10T08:12:00+00:00",
      humanId: null,
      name: null,
      linkedElsewhere: null,
    });
  });

  it("treats a channel-less row as WhatsApp, and falls back to the first STOP as the latest", () => {
    const { channel: _channel, ...noChannel } = base;
    const stop = conversationWhatsappStop({ ...noChannel, whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00" });
    expect(stop.kind).toBe("number_stop");
    expect(stop.lastStopAt).toBe("2026-10-03T13:05:00+00:00");
  });

  it("does not name a linked customer switched off on this same number", () => {
    const stop = conversationWhatsappStop({
      ...base,
      whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00",
      humans: { ...base.humans, whatsapp_opted_out: true, whatsapp_opted_out_reason: "asked_on_whatsapp" },
    });
    expect(stop.kind).toBe("number_stop");
    expect(stop.linkedElsewhere).toBeNull();
  });

  it("names a linked customer switched off under another number", () => {
    const stop = conversationWhatsappStop({
      ...base,
      whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00",
      humans: { ...base.humans, phone: "07700 900999", whatsapp_opted_out: true },
    });
    expect(stop.kind).toBe("number_stop");
    expect(stop.linkedElsewhere).toEqual({ id: "human-1", name: "Sarah Jones" });
  });

  it("is record_off when the linked customer is switched off on this number", () => {
    const stop = conversationWhatsappStop({
      ...base,
      humans: {
        ...base.humans,
        // Stored formatted, still the same number.
        phone: "+44 (0)7700 900 123",
        whatsapp_opted_out: true,
        whatsapp_opted_out_at: "2026-10-03T13:05:00+00:00",
        whatsapp_opted_out_reason: "Asked by phone",
      },
    });
    expect(stop).toMatchObject({
      kind: "record_off",
      reason: "Asked by phone",
      since: "2026-10-03T13:05:00+00:00",
      linkedElsewhere: null,
    });
  });

  it("is record_other_number when the linked customer's number differs", () => {
    const stop = conversationWhatsappStop({
      ...base,
      humans: { ...base.humans, phone: "07700 900999", whatsapp_opted_out: true },
    });
    expect(stop.kind).toBe("record_other_number");
    expect(stop.name).toBe("Sarah Jones");
  });

  it("is record_other_number when the linked customer has no number", () => {
    const stop = conversationWhatsappStop({
      ...base,
      humans: { ...base.humans, phone: null, whatsapp_opted_out: true },
    });
    expect(stop.kind).toBe("record_other_number");
  });

  it("ignores an opt-out on an embed with no link", () => {
    const stop = conversationWhatsappStop({
      ...base,
      human_id: null,
      humans: { ...base.humans, whatsapp_opted_out: true },
    });
    expect(stop.kind).toBe("none");
  });
});

describe("whitespace-only names", () => {
  it("are no name at all, never a blank one", () => {
    const stop = conversationWhatsappStop({
      channel: "whatsapp",
      phone_e164: "+447700900123",
      human_id: "human-1",
      whatsapp_opted_out_at: null,
      whatsapp_last_stop_at: null,
      humans: {
        name: " ",
        surname: "  ",
        phone: "07700 900999",
        whatsapp_opted_out: true,
      },
    });
    expect(stop.kind).toBe("record_other_number");
    expect(stop.name).toBeNull();
    expect(recordDisplayName({ name: "  " })).toBe("Unnamed record");
  });
});

describe("isStrictlyLater", () => {
  it("compares to the microsecond, past the millisecond Date.parse keeps", () => {
    expect(isStrictlyLater("2026-10-14T13:32:00.000002+00:00", "2026-10-14T13:32:00.000001+00:00")).toBe(true);
    expect(isStrictlyLater("2026-10-14T13:32:00.000001+00:00", "2026-10-14T13:32:00.000002+00:00")).toBe(false);
    expect(Date.parse("2026-10-14T13:32:00.000002+00:00")).toBe(Date.parse("2026-10-14T13:32:00.000001+00:00"));
  });

  it("is false for the same instant, however it is spelled", () => {
    expect(isStrictlyLater("2026-10-14T13:32:00.5+00:00", "2026-10-14T14:32:00.500000+01:00")).toBe(false);
    expect(isStrictlyLater("2026-10-14T13:32:00Z", "2026-10-14T13:32:00.000000+00:00")).toBe(false);
  });

  it("compares milliseconds first", () => {
    expect(isStrictlyLater("2026-10-14T13:32:00.002+00:00", "2026-10-14T13:32:00.001999+00:00")).toBe(true);
    expect(isStrictlyLater("2026-10-14T13:31:59.999999+00:00", "2026-10-14T13:32:00+00:00")).toBe(false);
  });

  it("is false when either time is missing or unreadable", () => {
    expect(isStrictlyLater(null, "2026-10-14T13:32:00Z")).toBe(false);
    expect(isStrictlyLater("2026-10-14T13:32:00Z", undefined)).toBe(false);
    expect(isStrictlyLater("not a time", "2026-10-14T13:32:00Z")).toBe(false);
    expect(isStrictlyLater("2026-10-14T13:32:00Z", "")).toBe(false);
  });
});

describe("auditReadSince", () => {
  const record = (optedOutAt: string | null): OptOutRecord => ({
    id: SARAH,
    name: "Sarah Jones",
    phone: null,
    reason: null,
    optedOutAt,
  });

  it("is the earliest switch-off or STOP, as the server's string", () => {
    expect(
      auditReadSince({
        lastStopAt: "2026-10-10T08:12:00.654321+00:00",
        records: [record("2026-10-03T13:05:00.123457+00:00"), record("2026-10-03T13:05:00.123456+00:00")],
      }),
    ).toBe("2026-10-03T13:05:00.123456+00:00");
  });

  it("is the latest STOP when it came first, or is all there is", () => {
    expect(auditReadSince({ lastStopAt: "2026-10-01T00:00:00Z", records: [record("2026-10-03T00:00:00Z")] })).toBe(
      "2026-10-01T00:00:00Z",
    );
    expect(auditReadSince({ lastStopAt: "2026-10-01T00:00:00Z", records: [] })).toBe("2026-10-01T00:00:00Z");
  });

  it("skips missing and unreadable times, and is null with none", () => {
    expect(auditReadSince({ lastStopAt: null, records: [record(null), record("garbage"), record("2026-10-03T00:00:00Z")] })).toBe(
      "2026-10-03T00:00:00Z",
    );
    expect(auditReadSince({ lastStopAt: null, records: [record(null)] })).toBeNull();
  });
});

describe("attributeCleared", () => {
  const ME = "99999999-9999-4999-8999-999999999999";
  const COLLEAGUE = "88888888-8888-4888-8888-888888888888";
  const STOP = "2026-10-03T13:05:00.123456+00:00";
  const NOTE = "Rang the salon on 14 Oct and asked for reminders again.";
  const sarah: OptOutRecord = { id: SARAH, name: "Sarah Jones", phone: null, reason: "asked_on_whatsapp", optedOutAt: STOP };
  const tom: OptOutRecord = { id: TOM, name: "Tom Jones", phone: null, reason: "asked_on_whatsapp", optedOutAt: STOP };
  const previous = scope({ lastStopAt: STOP, records: [sarah, tom] });
  const empty = scope({ numberStoppedAt: null, lastStopAt: null, records: [] });

  function row(overrides: Partial<AuditRow> = {}): AuditRow {
    return {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      humanIds: [SARAH, TOM],
      conversationIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      permissionNote: NOTE,
      reenabledBy: ME,
      reenabledAt: "2026-10-14T13:00:00.000001+00:00",
      ...overrides,
    };
  }

  const attribute = (input: Partial<Parameters<typeof attributeCleared>[0]> = {}) =>
    attributeCleared({ previous, next: empty, rows: [], me: ME, submittedNote: NOTE, ...input });

  it("treats absence alone as leaving the number, never as switched on", () => {
    expect(attribute()).toEqual({ byUs: [], byOthers: [], leftNumber: [SARAH, TOM], ourRow: null });
    expect(attribute({ next: null }).leftNumber).toEqual([SARAH, TOM]);
  });

  it("only considers records the re-read no longer lists", () => {
    const result = attribute({ next: scope({ records: [sarah] }), rows: [row({ reenabledBy: COLLEAGUE })] });
    expect(result).toEqual({ byUs: [], byOthers: [TOM], leftNumber: [], ourRow: null });
  });

  it("recognises our own row by who sent it and the note, trimmed", () => {
    const ours = row();
    expect(attribute({ rows: [ours], submittedNote: `  ${NOTE}\n` })).toEqual({
      byUs: [SARAH, TOM],
      byOthers: [],
      leftNumber: [],
      ourRow: ours,
    });
    // Any of my rows, when the note does not matter.
    expect(attribute({ rows: [ours], submittedNote: null }).ourRow).toBe(ours);
  });

  it("does not take a colleague's row, my row with another note, or any row with no one signed in", () => {
    for (const input of [
      { rows: [row({ reenabledBy: COLLEAGUE })] },
      { rows: [row({ permissionNote: "Another conversation." })] },
      { rows: [row()], me: null },
    ]) {
      expect(attribute(input)).toMatchObject({ byUs: [], byOthers: [SARAH, TOM], leftNumber: [], ourRow: null });
    }
  });

  it("needs the record in the row", () => {
    const result = attribute({ rows: [row({ reenabledBy: COLLEAGUE, humanIds: [SARAH] })] });
    expect(result).toMatchObject({ byOthers: [SARAH], leftNumber: [TOM] });
  });

  it("needs the row strictly after the record's switch-off, to the microsecond", () => {
    const at = (reenabledAt: string) =>
      attributeCleared({
        previous: scope({ lastStopAt: null, records: [sarah] }),
        next: empty,
        rows: [row({ reenabledBy: COLLEAGUE, reenabledAt })],
        me: ME,
        submittedNote: NOTE,
      });
    expect(at("2026-10-03T13:05:00.123457+00:00").byOthers).toEqual([SARAH]);
    expect(at(STOP).leftNumber).toEqual([SARAH]);
    expect(at("2026-10-03T13:05:00.123455+00:00").leftNumber).toEqual([SARAH]);
  });

  it("needs the row strictly after the latest STOP staff saw", () => {
    const LAST = "2026-10-10T08:12:00.654321+00:00";
    const result = attribute({
      previous: scope({ lastStopAt: LAST, records: [sarah] }),
      rows: [row({ reenabledBy: COLLEAGUE, reenabledAt: LAST })],
    });
    expect(result.leftNumber).toEqual([SARAH]);
    const later = attribute({
      previous: scope({ lastStopAt: LAST, records: [sarah] }),
      rows: [row({ reenabledBy: COLLEAGUE, reenabledAt: "2026-10-10T08:12:00.654322+00:00" })],
    });
    expect(later.byOthers).toEqual([SARAH]);
  });

  it("never proves a record with no switch-off time, not even with our own row", () => {
    const legacy = { ...tom, optedOutAt: null };
    const result = attribute({ previous: scope({ lastStopAt: STOP, records: [sarah, legacy] }), rows: [row()] });
    expect(result).toEqual({ byUs: [SARAH], byOthers: [], leftNumber: [TOM], ourRow: row() });
    // Alone, it cannot even identify our row.
    expect(attribute({ previous: scope({ lastStopAt: null, records: [legacy] }), rows: [row()] })).toEqual({
      byUs: [],
      byOthers: [],
      leftNumber: [TOM],
      ourRow: null,
    });
  });

  it("splits ours from a colleague's when both are on record", () => {
    const colleague = row({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", reenabledBy: COLLEAGUE, humanIds: [TOM] });
    const ours = row({ humanIds: [SARAH] });
    expect(attribute({ rows: [colleague, ours] })).toEqual({
      byUs: [SARAH],
      byOthers: [TOM],
      leftNumber: [],
      ourRow: ours,
    });
  });

  it("takes our latest row when there are several", () => {
    const first = row({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", reenabledAt: "2026-10-14T13:00:00.000001+00:00" });
    const second = row({ reenabledAt: "2026-10-14T13:00:00.000002+00:00" });
    expect(attribute({ rows: [first, second] }).ourRow).toBe(second);
    expect(attribute({ rows: [second, first] }).ourRow).toBe(second);
  });

  it("still reports our row when the records are back on the number", () => {
    const ours = row();
    const LATER = "2026-10-14T13:32:00.000001+00:00";
    const result = attribute({
      next: scope({ lastStopAt: LATER, records: [{ ...sarah, optedOutAt: LATER }, { ...tom, optedOutAt: LATER }] }),
      rows: [ours],
    });
    expect(result).toEqual({ byUs: [], byOthers: [], leftNumber: [], ourRow: ours });
  });

  describe("a number with no customer record", () => {
    const numberOnly = scope({ lastStopAt: STOP, records: [] });

    it("our row clearing a conversation after its STOP is ours", () => {
      const ours = row({ humanIds: [] });
      expect(attribute({ previous: numberOnly, rows: [ours] })).toEqual({
        byUs: [],
        byOthers: [],
        leftNumber: [],
        ourRow: ours,
      });
    });

    it("needs a conversation, a STOP, and a later row", () => {
      expect(attribute({ previous: numberOnly, rows: [row({ humanIds: [], conversationIds: [] })] }).ourRow).toBeNull();
      expect(attribute({ previous: numberOnly, rows: [row({ humanIds: [], reenabledAt: STOP })] }).ourRow).toBeNull();
      expect(
        attribute({ previous: scope({ numberStoppedAt: null, lastStopAt: null, records: [] }), rows: [row()] }).ourRow,
      ).toBeNull();
    });
  });
});

describe("joinNames", () => {
  it("joins names as a sentence would", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Sarah"])).toBe("Sarah");
    expect(joinNames(["Sarah", "Tom"])).toBe("Sarah and Tom");
    expect(joinNames(["Sarah", "Tom", "Bea"])).toBe("Sarah, Tom and Bea");
  });
});

describe("leftNumberMessage", () => {
  it("is null with nobody to name", () => {
    expect(leftNumberMessage([])).toBeNull();
  });

  it("names one record, unnamed ones included", () => {
    expect(leftNumberMessage([{ name: "Sarah Jones" }])).toBe(
      "Sarah Jones isn’t switched off on this number any more, but WhatsApp hasn’t been switched back on for them. Their number may have changed — open their profile to check.",
    );
    expect(leftNumberMessage([{ name: "  " }])).toMatch(/^Unnamed record isn’t switched off/);
  });

  it("names several", () => {
    expect(leftNumberMessage([{ name: "Sarah Jones" }, { name: "Tom Jones" }])).toBe(
      "Sarah Jones and Tom Jones aren’t switched off on this number any more, but WhatsApp hasn’t been switched back on for them. Their numbers may have changed — open their profiles to check.",
    );
  });
});
