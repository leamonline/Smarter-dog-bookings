// A Meta "failed" delivery status must reach notification_log, or no staff
// surface ever shows it (see supabase/functions/_shared/deliveryStatus.ts).
import { describe, expect, it } from "vitest";
import {
  META_UNDELIVERABLE,
  metaFailureSummary,
  notificationLogPatchForStatus,
} from "../../../supabase/functions/_shared/deliveryStatus";

// The exact error body production recorded for all 49 failed sends, Jun–Oct 2026.
const UNDELIVERABLE = [
  {
    code: 131026,
    title: "Message undeliverable",
    message: "Message undeliverable",
    error_data: { details: "Message Undeliverable." },
  },
];

describe("notificationLogPatchForStatus", () => {
  it("marks the log row failed when Meta says the message failed", () => {
    expect(notificationLogPatchForStatus("failed", UNDELIVERABLE)).toEqual({
      status: "failed",
      error_message: expect.stringContaining("may not be on WhatsApp"),
    });
  });

  it.each(["sent", "delivered", "read", null, undefined])(
    "leaves the log alone for %s",
    (status) => {
      expect(notificationLogPatchForStatus(status, UNDELIVERABLE)).toBeNull();
    },
  );
});

describe("metaFailureSummary", () => {
  it("explains the common undeliverable case in salon terms and keeps the code", () => {
    const text = metaFailureSummary(UNDELIVERABLE);
    expect(text).toMatch(/may not be on WhatsApp/);
    expect(text).toContain(String(META_UNDELIVERABLE));
  });

  it("falls back to Meta's own title for other codes", () => {
    expect(metaFailureSummary([{ code: 131047, title: "Re-engagement message" }])).toBe(
      "WhatsApp could not deliver this: Re-engagement message (Meta 131047).",
    );
  });

  it("still says something useful with no error detail at all", () => {
    expect(metaFailureSummary([])).toBe("WhatsApp could not deliver this message.");
    expect(metaFailureSummary(undefined)).toBe("WhatsApp could not deliver this message.");
  });
});
