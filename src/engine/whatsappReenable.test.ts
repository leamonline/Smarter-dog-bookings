import { describe, expect, it } from "vitest";
import {
  DATE_NOT_RECORDED,
  REENABLE_NOTE_MIN_LENGTH,
  classifyReenableError,
  conversationWhatsappStop,
  diffScopes,
  formatOptOutTime,
  hasScopeChanges,
  isNewerStop,
  isPermissionNoteLongEnough,
  isScopeEmpty,
  optOutReasonLabel,
  optOutTimeLabel,
  recordDisplayName,
  type NumberOptOutScope,
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
