import { describe, expect, it } from "vitest";
import {
  buildStaffPushMessage,
  isStaffEventType,
  selectRecipients,
  STAFF_EVENT_TYPES,
  type StaffAlertPrefsRow,
  type StaffSubscriptionRow,
} from "../../../supabase/functions/_shared/staffPush.ts";

describe("isStaffEventType", () => {
  it("accepts the six known types and rejects others", () => {
    for (const t of STAFF_EVENT_TYPES) expect(isStaffEventType(t)).toBe(true);
    expect(isStaffEventType("reconfirmed")).toBe(false);
    expect(isStaffEventType(null)).toBe(false);
    expect(isStaffEventType(42)).toBe(false);
  });
});

describe("buildStaffPushMessage", () => {
  it("formats a new booking with date + slot", () => {
    const m = buildStaffPushMessage("new_booking", {
      customerName: "Catherine Green",
      dogName: "Alfie",
      service: "Full Groom",
      bookingDate: "2026-06-01",
      slot: "09:00",
    });
    expect(m.title).toBe("New booking");
    expect(m.body).toContain("Catherine Green");
    expect(m.body).toContain("Full Groom");
    expect(m.body).toContain("Alfie");
    expect(m.body).toContain("9:00am");
    expect(m.url).toBe("/staff/");
    expect(m.category).toBe("new_booking");
    expect(m.triggerType).toBe("staff_new_booking");
  });

  it("routes messages to /staff/inbox and uses the sender name", () => {
    const m = buildStaffPushMessage("message", { senderName: "Jo" });
    expect(m.url).toBe("/staff/inbox");
    expect(m.body).toContain("Jo");
    expect(m.triggerType).toBe("staff_message");
  });

  it("maps every event type to a trigger_type and never throws on empty context", () => {
    for (const t of STAFF_EVENT_TYPES) {
      const m = buildStaffPushMessage(t);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
      expect(m.triggerType).toBe(`staff_${t}`);
    }
  });

  it("sanitises injected HTML in names", () => {
    const m = buildStaffPushMessage("new_client", {
      customerName: "<b>Evil</b> Name",
    });
    expect(m.body).not.toContain("<b>");
    expect(m.body).toContain("Evil Name");
  });
});

describe("selectRecipients", () => {
  const sub = (id: string, user: string): StaffSubscriptionRow => ({
    id,
    user_id: user,
    endpoint: `https://push/${id}`,
    p256dh: "p",
    auth: "a",
  });
  const prefs = (
    user: string,
    overrides: Partial<StaffAlertPrefsRow> = {},
  ): StaffAlertPrefsRow => ({
    user_id: user,
    messages: true,
    new_booking: true,
    cancellation: true,
    reschedule: true,
    new_client: true,
    waitlist: true,
    ...overrides,
  });

  it("notifies everyone when there is no actor (customer/AI booking)", () => {
    const subs = [sub("s1", "alice"), sub("s2", "bob")];
    const out = selectRecipients(subs, new Map(), "new_booking", null);
    expect(out.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("suppresses ONLY the actor's own devices, not other staff", () => {
    const subs = [sub("s1", "alice"), sub("s2", "alice"), sub("s3", "bob")];
    const out = selectRecipients(subs, new Map(), "new_booking", "alice");
    expect(out.map((s) => s.id)).toEqual(["s3"]);
  });

  it("honours a disabled category", () => {
    const subs = [sub("s1", "alice"), sub("s2", "bob")];
    const byUser = new Map<string, StaffAlertPrefsRow>([
      ["alice", prefs("alice", { cancellation: false })],
      ["bob", prefs("bob")],
    ]);
    const out = selectRecipients(subs, byUser, "cancellation", null);
    expect(out.map((s) => s.id)).toEqual(["s2"]);
  });

  it("treats a missing prefs row as all-enabled", () => {
    const subs = [sub("s1", "alice")];
    const out = selectRecipients(subs, new Map(), "waitlist", null);
    expect(out).toHaveLength(1);
  });

  it("maps the 'message' event to the 'messages' prefs column", () => {
    const subs = [sub("s1", "alice")];
    const byUser = new Map<string, StaffAlertPrefsRow>([
      ["alice", prefs("alice", { messages: false })],
    ]);
    expect(selectRecipients(subs, byUser, "message", null)).toHaveLength(0);
  });

  it("drops subscriptions missing key material", () => {
    const broken: StaffSubscriptionRow = {
      id: "s1",
      user_id: "alice",
      endpoint: "https://push/s1",
      p256dh: null,
      auth: null,
    };
    expect(selectRecipients([broken], new Map(), "new_booking", null)).toHaveLength(0);
  });
});
