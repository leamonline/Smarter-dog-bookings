import { describe, expect, it } from "vitest";
import { shapeAgentFailures } from "./useAgentFailures";

describe("shapeAgentFailures", () => {
  it("keeps only failed events, newest first, mapped to the card shape", () => {
    const rows = [
      { id: "1", phone_e164: "+4471", processing_status: "processed", error_message: null, received_at: "2026-06-25T09:00:00Z", event_type: "messages" },
      { id: "2", phone_e164: "+4472", processing_status: "failed", error_message: "boom", received_at: "2026-06-25T10:00:00Z", event_type: "messages" },
      { id: "3", phone_e164: "+4473", processing_status: "failed", error_message: "kaboom", received_at: "2026-06-25T11:00:00Z", event_type: "messages" },
    ];
    const out = shapeAgentFailures(rows);
    expect(out.map((f) => f.id)).toEqual(["3", "2"]);
    expect(out[0]).toMatchObject({ phone: "+4473", error: "kaboom", eventType: "messages" });
  });
});
