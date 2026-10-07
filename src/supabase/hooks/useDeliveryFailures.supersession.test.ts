// When does a failed customer notification stay on the staff screens?
import { describe, expect, it } from "vitest";
import {
  baseTrigger,
  liveFailuresByBooking,
  triggerLabel,
  unreachableHumanIds,
} from "./useDeliveryFailures";

type Row = Parameters<typeof liveFailuresByBooking>[0][number];

function row(over: Partial<Row>): Row {
  return {
    booking_id: "b1",
    human_id: "h1",
    trigger_type: "reminder",
    channel: "whatsapp",
    status: "failed",
    error_message: "WhatsApp could not deliver this",
    created_at: "2026-10-05T09:00:00Z",
    ...over,
  };
}

describe("liveFailuresByBooking", () => {
  it("keeps a failure that nothing has replaced", () => {
    const live = liveFailuresByBooking([row({})]);
    expect(live.get("b1")?.map((f) => f.trigger_type)).toEqual(["reminder"]);
  });

  it("clears it once staff resend successfully", () => {
    const live = liveFailuresByBooking([
      row({ status: "sent", created_at: "2026-10-05T10:00:00Z" }),
      row({}),
    ]);
    expect(live.has("b1")).toBe(false);
  });

  // The SMS safety net resends a failed WhatsApp reminder as a text. If that
  // text went out, the customer has been told and the card should not tell
  // staff to phone them.
  it("clears it once the SMS fallback has gone out", () => {
    const live = liveFailuresByBooking([
      row({ trigger_type: "reminder_sms_fallback", channel: "sms", status: "sent", created_at: "2026-10-05T10:05:00Z" }),
      row({}),
    ]);
    expect(live.has("b1")).toBe(false);
  });

  it("keeps it live when the SMS fallback failed as well, under the plain name", () => {
    const live = liveFailuresByBooking([
      row({ trigger_type: "reminder_sms_fallback", channel: "sms", status: "failed", created_at: "2026-10-05T10:05:00Z" }),
      row({}),
    ]);
    expect(live.get("b1")?.map((f) => f.trigger_type)).toEqual(["reminder"]);
  });

  it("does not let a sent confirmation clear a failed reminder", () => {
    const live = liveFailuresByBooking([
      row({ trigger_type: "confirmed", status: "sent", created_at: "2026-10-05T10:00:00Z" }),
      row({}),
    ]);
    expect(live.get("b1")?.map((f) => f.trigger_type)).toEqual(["reminder"]);
  });
});

describe("unreachableHumanIds", () => {
  const rows = (statuses: string[], human = "h1") => statuses.map((status) => ({ human_id: human, status }));

  it("flags a customer whose last three WhatsApp sends all failed", () => {
    expect(unreachableHumanIds(rows(["failed", "failed", "failed", "sent"]))).toEqual(new Set(["h1"]));
  });

  it("does not flag one or two failures, or a recent success", () => {
    expect(unreachableHumanIds(rows(["failed", "failed"])).size).toBe(0);
    expect(unreachableHumanIds(rows(["failed", "sent", "failed", "failed"])).size).toBe(0);
  });

  it("judges each customer on their own sends", () => {
    const mixed = [...rows(["failed", "failed", "failed"], "a"), ...rows(["failed", "sent", "failed"], "b")];
    expect(unreachableHumanIds(mixed)).toEqual(new Set(["a"]));
  });
});

describe("trigger names", () => {
  it("reads an SMS fallback as the message it stands in for", () => {
    expect(baseTrigger("confirmed_sms_fallback")).toBe("confirmed");
    expect(triggerLabel("reminder_sms_fallback")).toBe("Reminder");
    expect(triggerLabel("reminder")).toBe("Reminder");
  });
});
