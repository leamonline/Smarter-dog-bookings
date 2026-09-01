import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  get supabase() {
    return (globalThis as { __staffClient?: unknown }).__staffClient ?? null;
  },
}));

const {
  broadcastMessage,
  resendBookingNotification,
  sendBookingReminder,
  sendReminder,
  sendWhatsAppTemplate,
  useStaffMessaging,
} = await import("./useStaffMessaging");

const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
const client = { functions: { invoke } };

beforeEach(() => {
  (globalThis as { __staffClient?: unknown }).__staffClient = client;
  vi.clearAllMocks();
});

describe("useStaffMessaging", () => {
  it("reports connected only when a staff client exists, and is a stable singleton", () => {
    expect(useStaffMessaging().connected).toBe(true);
    expect(useStaffMessaging()).toBe(useStaffMessaging());
    (globalThis as { __staffClient?: unknown }).__staffClient = null;
    expect(useStaffMessaging().connected).toBe(false);
  });

  it("resends a booking notification with the snake_case body the function expects", async () => {
    await resendBookingNotification("b-1", "booking_confirmed");
    expect(invoke).toHaveBeenCalledWith("resend-booking-notification", {
      body: { booking_id: "b-1", trigger_type: "booking_confirmed" },
    });
  });

  it("broadcasts a day-closure message, passing dry_run through", async () => {
    await broadcastMessage({ bookingDate: "2026-09-08", reason: "Snow day", dryRun: true });
    expect(invoke).toHaveBeenCalledWith("broadcast-message", {
      body: { booking_date: "2026-09-08", reason: "Snow day", dry_run: true },
    });
  });

  it("sends tomorrow's reminder from one anchor booking id and returns the raw result", async () => {
    const result = await sendBookingReminder("b-9");
    expect(invoke).toHaveBeenCalledWith("notify-booking-reminder", { body: { booking_id: "b-9" } });
    expect(result).toEqual({ data: { ok: true }, error: null });
  });

  it("sends a WhatsApp template with the snake_case body whatsapp-send expects", async () => {
    await sendWhatsAppTemplate({
      to: "+447700900111",
      templateName: "ready_for_collection_v1",
      language: "en_GB",
      params: [{ type: "text", text: "Bella" }],
      humanId: "h1",
    });
    expect(invoke).toHaveBeenCalledWith("whatsapp-send", {
      body: {
        mode: "template",
        to: "+447700900111",
        template_name: "ready_for_collection_v1",
        language: "en_GB",
        params: [{ type: "text", text: "Bella" }],
        human_id: "h1",
      },
    });
  });

  it("sends a composed reminder with the channel payload spread beside the anchor booking id", async () => {
    await sendReminder("b-9", { channel: "sms", message: "See you tomorrow" });
    expect(invoke).toHaveBeenCalledWith("reminder-send", {
      body: { booking_id: "b-9", channel: "sms", message: "See you tomorrow" },
    });
  });

  it("rejects rather than invoking anything when there is no client", async () => {
    (globalThis as { __staffClient?: unknown }).__staffClient = null;
    await expect(sendBookingReminder("b-9")).rejects.toThrow("Not connected");
    await expect(broadcastMessage({ bookingDate: "d", reason: "r", dryRun: false })).rejects.toThrow("Not connected");
    await expect(resendBookingNotification("b", "t")).rejects.toThrow("Not connected");
    expect(invoke).not.toHaveBeenCalled();
  });
});
