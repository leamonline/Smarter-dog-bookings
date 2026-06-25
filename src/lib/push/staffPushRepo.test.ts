import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAFF_ALERT_PREFS,
  dbRowToPrefs,
  prefsToDbRow,
} from "../../supabase/repositories/staffPushRepo";

describe("staffPushRepo prefs mapping", () => {
  it("maps a DB row (snake_case) to camelCase prefs", () => {
    const prefs = dbRowToPrefs({
      user_id: "u1",
      messages: true,
      new_booking: false,
      cancellation: true,
      reschedule: false,
      new_client: true,
      waitlist: false,
    });
    expect(prefs).toEqual({
      messages: true,
      newBooking: false,
      cancellation: true,
      reschedule: false,
      newClient: true,
      waitlist: false,
    });
  });

  it("maps camelCase prefs back to a DB row keyed by user_id", () => {
    const row = prefsToDbRow("u9", {
      messages: false,
      newBooking: true,
      cancellation: false,
      reschedule: true,
      newClient: false,
      waitlist: true,
    });
    expect(row).toEqual({
      user_id: "u9",
      messages: false,
      new_booking: true,
      cancellation: false,
      reschedule: true,
      new_client: false,
      waitlist: true,
    });
  });

  it("round-trips defaults", () => {
    const row = prefsToDbRow("u1", DEFAULT_STAFF_ALERT_PREFS);
    expect(dbRowToPrefs(row)).toEqual(DEFAULT_STAFF_ALERT_PREFS);
  });
});
