import { describe, expect, it, vi } from "vitest";
import { fetchConfirmationContact, fetchConfirmationSnapshot } from "./bookingConfirmationRepo";

function clientWith(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order"]) query[method] = (...args: unknown[]) => {
      calls.push({ table, method, args }); return query;
    };
    query.maybeSingle = async () => results[table];
    query.then = (resolve: (value: unknown) => void) => Promise.resolve(results[table]).then(resolve);
    return query;
  });
  return { client: { from } as never, calls, from };
}

describe("booking confirmation repository", () => {
  it("reads the profile's preferred method and all eligibility flags for just the selected owner", async () => {
    const { client, calls } = clientWith({ humans: { data: {
      phone: "+447700900123", whatsapp: false, email: null,
      whatsapp_opted_out: false, sms_opted_out: true, email_opted_out: false,
    }, error: null } });
    expect(await fetchConfirmationContact(client, "owner-id")).toEqual({
      phone: "+447700900123", whatsapp: false, email: null,
      whatsappOptedOut: false, smsOptedOut: true, emailOptedOut: false,
    });
    expect(calls).toContainEqual({ table: "humans", method: "eq", args: ["id", "owner-id"] });
  });
  it("does not read the legacy preferred_channel column, which could contradict the profile", async () => {
    const { client, calls } = clientWith({ humans: { data: null, error: null } });
    await fetchConfirmationContact(client, "owner-id");
    const select = calls.find((call) => call.table === "humans" && call.method === "select");
    expect(String(select?.args[0])).not.toContain("preferred_channel");
    expect(String(select?.args[0])).toContain("whatsapp");
  });
  it("does not substitute a preference for a missing or failed read", async () => {
    const missing = clientWith({ humans: { data: null, error: null } });
    expect(await fetchConfirmationContact(missing.client, "owner")).toBeNull();
    const failure = clientWith({ humans: { data: null, error: new Error("unavailable") } });
    await expect(fetchConfirmationContact(failure.client, "owner")).rejects.toThrow();
  });
  it("scopes logs to the saved IDs and looks up matching outbound provider receipts", async () => {
    const { client, calls, from } = clientWith({
      notification_log: { data: [{ booking_id: "saved", group_id: "group", human_id: "owner", trigger_type: "confirmed", channel: "sms", status: "sent", error_message: null, created_at: "2026-11-11", provider_message_id: "SM123" }], error: null },
      whatsapp_messages: { data: [{ meta_message_id: "SM123", channel: "sms", status: "delivered" }], error: null },
    });
    const value = await fetchConfirmationSnapshot(client, ["saved"]);
    expect(value.logs[0]).toMatchObject({ bookingId: "saved", groupId: "group", providerId: "SM123" });
    expect(value.deliveries[0]).toEqual({ providerId: "SM123", channel: "sms", status: "delivered" });
    expect(calls).toContainEqual({ table: "notification_log", method: "in", args: ["booking_id", ["saved"]] });
    expect(calls).toContainEqual({ table: "whatsapp_messages", method: "eq", args: ["direction", "outbound"] });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["notification_log", "whatsapp_messages"]);
  });
  it("returns no fabricated delivery evidence when logs are absent", async () => {
    const { client, from } = clientWith({ notification_log: { data: [], error: null } });
    expect(await fetchConfirmationSnapshot(client, ["saved"])).toEqual({ logs: [], deliveries: [] });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
