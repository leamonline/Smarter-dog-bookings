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
