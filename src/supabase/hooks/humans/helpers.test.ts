import { describe, expect, it } from "vitest";
import {
  buildHumanMapEntry,
  humanEntryToRow,
  whatsappOptOutFromRow,
  type HumanPatch,
} from "./helpers";

const stoppedRow = {
  id: "h1",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900123",
  whatsapp_opted_out: true,
  whatsapp_opted_out_at: "2026-10-03T13:05:00.123456+00:00",
  whatsapp_opted_out_reason: "asked_on_whatsapp",
};

describe("WhatsApp opt-out on human entries", () => {
  it("buildHumanMapEntry carries the three opt-out columns", () => {
    expect(buildHumanMapEntry(stoppedRow)).toMatchObject({
      whatsappOptedOut: true,
      whatsappOptedOutAt: "2026-10-03T13:05:00.123456+00:00",
      whatsappOptedOutReason: "asked_on_whatsapp",
    });
  });

  it("defaults to switched on when the columns are absent or null", () => {
    expect(buildHumanMapEntry({ id: "h2", name: "Dave" })).toMatchObject({
      whatsappOptedOut: false,
      whatsappOptedOutAt: null,
      whatsappOptedOutReason: null,
    });
    expect(
      whatsappOptOutFromRow({ whatsapp_opted_out: null, whatsapp_opted_out_at: null, whatsapp_opted_out_reason: null }),
    ).toEqual({ whatsappOptedOut: false, whatsappOptedOutAt: null, whatsappOptedOutReason: null });
  });

  it("humanEntryToRow round-trips them", () => {
    const entry = buildHumanMapEntry(stoppedRow);
    const row = humanEntryToRow(entry);
    expect(row).toMatchObject({
      whatsapp_opted_out: true,
      whatsapp_opted_out_at: "2026-10-03T13:05:00.123456+00:00",
      whatsapp_opted_out_reason: "asked_on_whatsapp",
    });
    expect(buildHumanMapEntry(row)).toMatchObject({
      whatsappOptedOut: true,
      whatsappOptedOutAt: "2026-10-03T13:05:00.123456+00:00",
      whatsappOptedOutReason: "asked_on_whatsapp",
    });
  });

  it("carries the no-show deposit note and keeps it off the editable patch", () => {
    expect(
      buildHumanMapEntry({
        id: "h3",
        name: "Mark",
        surname: "Johnson",
        deposit_required: true,
        deposit_required_reason: "Deposit required after a no-show: Pepper on 22 Nov 2026",
        deposit_required_set_at: "2026-11-22T10:00:00.000Z",
      }),
    ).toMatchObject({
      depositRequired: true,
      depositRequiredReason: "Deposit required after a no-show: Pepper on 22 Nov 2026",
      depositRequiredSetAt: "2026-11-22T10:00:00.000Z",
    });
    const entry = buildHumanMapEntry({ id: "h4", name: "Amy" });
    expect(entry.depositRequiredReason).toBeNull();
    expect(entry.depositRequiredSetAt).toBeNull();
    expect(humanEntryToRow(entry)).toMatchObject({
      deposit_required_reason: null,
      deposit_required_set_at: null,
    });
    // @ts-expect-error the no-show note is recorded by the database, not by a staff edit
    const rewrite: HumanPatch = { depositRequiredReason: "Asked at the desk" };
    expect(rewrite).toEqual({ depositRequiredReason: "Asked at the desk" });
  });

  it("gives updateHuman no way to be handed an untick", () => {
    // The type is the guarantee: typecheck fails if HumanPatch ever accepts
    // the opt-out again (the directive itself errors when unused).
    // @ts-expect-error the WhatsApp opt-out is not an editable field
    const untick: HumanPatch = { whatsappOptedOut: false };
    // @ts-expect-error neither is its time
    const clearTime: HumanPatch = { whatsappOptedOutAt: null };
    // @ts-expect-error nor its reason
    const relabel: HumanPatch = { whatsappOptedOutReason: "staff" };
    const allowed: HumanPatch = { sms: false, aiWhatsappAllowed: false };
    expect([untick, clearTime, relabel, allowed]).toHaveLength(4);
  });
});
