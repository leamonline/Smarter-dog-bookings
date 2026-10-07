// When does a failed customer notification stay on the staff screens?
import { describe, expect, it } from "vitest";
import {
  applyMetaVerdicts,
  baseTrigger,
  liveFailuresByBooking,
  metaVerdictReason,
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
    provider_message_id: "wamid.A",
    ...over,
  };
}

const UNDELIVERABLE_JSON = JSON.stringify([{ code: 131026, title: "Message undeliverable" }]);

describe("applyMetaVerdicts", () => {
  // The log says 'sent' when Meta ACCEPTS a message. When Meta later fails it
  // — including before the notify function finished writing the id, and for
  // every send before the webhook learnt to copy the verdict — only the
  // whatsapp_messages row knows. The read side must still see a failure.
  it("treats a logged 'sent' as failed when Meta failed that message", () => {
    const failed = new Map([["wamid.A", metaVerdictReason(UNDELIVERABLE_JSON)]]);
    const [out] = applyMetaVerdicts([row({ status: "sent", error_message: null })], failed);
    expect(out.status).toBe("failed");
    expect(out.error_message).toMatch(/may not be on WhatsApp/);
  });

  it("leaves other messages, SMS rows and staff-side failures untouched", () => {
    const failed = new Map([["wamid.A", "x"]]);
    const rows = [
      row({ status: "sent", provider_message_id: "wamid.B" }),
      row({ status: "sent", channel: "sms" }),
      row({ status: "failed", error_message: "send-time error" }),
    ];
    expect(applyMetaVerdicts(rows, failed)).toEqual(rows);
  });
});

describe("liveFailuresByBooking", () => {
  it("keeps a failure that nothing has replaced", () => {
    expect(liveFailuresByBooking([row({})]).get("b1")?.map((f) => f.trigger_type)).toEqual(["reminder"]);
  });

  it("clears it once staff resend the same notification", () => {
    const live = liveFailuresByBooking([row({ status: "sent", created_at: "2026-10-05T10:00:00Z" }), row({})]);
    expect(live.has("b1")).toBe(false);
  });

  // An SMS row reading 'sent' only means the provider took the request. With
  // no SMS delivery receipt, that is not evidence the customer was told
  // (AGENTS.md: delivery is never inferred from an attempted provider call).
  it.each(["sent", "pending"])("does NOT clear it because an SMS fallback is %s", (status) => {
    const live = liveFailuresByBooking([
      row({ trigger_type: "reminder_sms_fallback", channel: "sms", status, created_at: "2026-10-05T10:05:00Z" }),
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
  const undeliverable = (id: string, human = "h1") => ({
    human_id: human,
    status: "failed",
    error_message: "WhatsApp could not deliver this — the number may not be on WhatsApp (Meta 131026).",
    provider_message_id: id,
  });

  it("flags a customer whose last three distinct sends were all undeliverable", () => {
    expect(unreachableHumanIds([undeliverable("a"), undeliverable("b"), undeliverable("c")])).toEqual(new Set(["h1"]));
  });

  // One message about a three-dog visit is logged once per booking under the
  // same provider id. That is one send, not three.
  it("counts one multi-dog message once", () => {
    expect(unreachableHumanIds([undeliverable("a"), undeliverable("a"), undeliverable("a")]).size).toBe(0);
  });

  // An outage, a credentials problem or a rejected template fails the send
  // too, but says nothing about the customer's number.
  it("does not count failures that are not Meta's undeliverable verdict", () => {
    const outage = (id: string) => ({ human_id: "h1", status: "failed", error_message: "whatsapp-send 500", provider_message_id: id });
    expect(unreachableHumanIds([undeliverable("a"), outage("b"), undeliverable("c")]).size).toBe(0);
  });

  it("does not flag a recent success or too few sends", () => {
    const sent = { human_id: "h1", status: "sent", error_message: null, provider_message_id: "z" };
    expect(unreachableHumanIds([undeliverable("a"), sent, undeliverable("b"), undeliverable("c")]).size).toBe(0);
    expect(unreachableHumanIds([undeliverable("a"), undeliverable("b")]).size).toBe(0);
  });
});

describe("labels", () => {
  it("reads an SMS fallback as the message it stands in for", () => {
    expect(baseTrigger("confirmed_sms_fallback")).toBe("confirmed");
    expect(triggerLabel("reminder_sms_fallback")).toBe("Reminder");
  });

  it("turns Meta's raw error into one readable line, even when it is garbage", () => {
    expect(metaVerdictReason(UNDELIVERABLE_JSON)).toMatch(/Meta 131026/);
    expect(metaVerdictReason("not json")).toBe("WhatsApp could not deliver this message.");
    expect(metaVerdictReason(null)).toBe("WhatsApp could not deliver this message.");
  });
});
