// A WhatsApp confirmation or reminder that never arrived must be visible on
// the Today card, in words, with the phone number one tap away.
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DayStack } from "./DayStack.jsx";
import { buildDayStack } from "../../../../engine/dayStack";
import { BOOKING_STATUS } from "../../../../constants/index";
import { undeliveredNotice } from "./undeliveredNotice";

const failures = new Map();
const unreachable = new Set();
vi.mock("../../../../supabase/hooks/useDeliveryFailures", async (importOriginal) => ({
  ...(await importOriginal()),
  useBookingDeliveryFailure: (id) => failures.get(id) ?? null,
  useUnreachableHumans: () => unreachable,
}));

const NOW = new Date("2026-07-02T07:15:00Z");
const TODAY = "2026-07-02";
const BOOKINGS = [
  { id: "told", dogName: "Hugo", slot: "10:00", status: BOOKING_STATUS.BOOKED, service: "full-groom", payment: "Due at Pick-up", _dogId: "d1", _bookingDate: TODAY },
  { id: "missed", dogName: "Nell", slot: "11:00", status: BOOKING_STATUS.BOOKED, service: "full-groom", payment: "Due at Pick-up", _dogId: "d2", _ownerId: "h2", _bookingDate: TODAY },
];

function renderStack() {
  return render(
    <DayStack
      rows={buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW })}
      resolve={(b) => ({ dogName: b.dogName, breed: "", owner: "Priya Raman", ownerPhone: "07700 900377", dogMissing: false, ownerMissing: false })}
      getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
      paymentOf={() => ({ kind: "due", amountDue: 42, subtotal: 42 })}
      lastVisitFor={() => null}
    />,
  );
}

const card = (id) => document.querySelector(`[data-booking-id="${id}"]`);

describe("undelivered notifications on the Today card", () => {
  beforeEach(() => {
    failures.clear();
    unreachable.clear();
  });

  it("marks only the booking whose reminder failed", () => {
    failures.set("missed", [{ trigger_type: "reminder", human_id: "h2" }]);
    renderStack();
    expect(card("missed").querySelector("[data-undelivered]").textContent).toBe("Reminder not delivered");
    expect(card("told").querySelector("[data-undelivered]")).toBeNull();
  });

  it("opens to a sentence that says what to do, with the number to call", () => {
    failures.set("missed", [{ trigger_type: "reminder", human_id: "h2" }]);
    renderStack();
    fireEvent.click(card("missed").querySelector("[data-undelivered]"));
    const detail = card("missed").querySelector("[data-undelivered-detail]");
    expect(detail.textContent).toMatch(/didn't reach them\. Give them a ring/);
    expect(screen.getByRole("link", { name: "Call 07700 900377" }).getAttribute("href")).toBe("tel:07700900377");
  });

  it("names it in the card's spoken label, not by colour alone", () => {
    failures.set("missed", [{ trigger_type: "confirmed", human_id: "h2" }]);
    renderStack();
    expect(card("missed").querySelector("[data-stack-head]").getAttribute("aria-label")).toMatch(/Confirmation not delivered/);
  });

  // Notifications are per recipient. A trusted contact's missed reminder must
  // not put the OWNER's number behind a "give them a ring".
  it("does not offer the owner's number when only a trusted contact's message failed", () => {
    failures.set("missed", [{ trigger_type: "reminder", human_id: "contact-9" }]);
    renderStack();
    fireEvent.click(card("missed").querySelector("[data-undelivered]"));
    const detail = card("missed").querySelector("[data-undelivered-detail]");
    expect(detail.textContent).toMatch(/the contact on this booking/);
    expect(screen.queryByRole("link", { name: /^Call / })).toBeNull();
  });

  it("says so plainly when the number looks like it isn't on WhatsApp", () => {
    failures.set("missed", [{ trigger_type: "reminder", human_id: "h2" }]);
    unreachable.add("h2");
    renderStack();
    expect(card("missed").querySelector("[data-undelivered]").textContent).toBe("Not on WhatsApp");
  });
});

describe("undeliveredNotice", () => {
  it("is null when everything arrived", () => {
    expect(undeliveredNotice(null, "h1")).toBeNull();
    expect(undeliveredNotice([], "h1")).toBeNull();
  });

  it("leads with the reminder when both failed, since that is the one that says turn up", () => {
    const notice = undeliveredNotice(
      [{ trigger_type: "confirmed", human_id: "h1" }, { trigger_type: "reminder", human_id: "h1" }],
      "h1",
    );
    expect(notice?.chip).toBe("Reminder not delivered");
    expect(notice?.callOwner).toBe(true);
  });

  // Customers can choose SMS or email; the card must say which one failed.
  it.each([
    ["sms", "Our text reminder"],
    ["email", "Our email reminder"],
    ["whatsapp", "Our WhatsApp reminder"],
  ])("names the %s channel that actually failed", (channel, phrase) => {
    expect(undeliveredNotice([{ trigger_type: "reminder", human_id: "h1", channel }], "h1")?.detail).toContain(phrase);
  });

  it("names a failed SMS fallback by the message it stood in for", () => {
    expect(undeliveredNotice([{ trigger_type: "reminder_sms_fallback", human_id: "h1" }], "h1")?.chip)
      .toBe("Reminder not delivered");
  });

  it("prefers the owner's failure when the owner and a contact both missed out", () => {
    const notice = undeliveredNotice(
      [{ trigger_type: "confirmed", human_id: "contact-9" }, { trigger_type: "reminder", human_id: "h1" }],
      "h1",
      (id) => id === "h1",
    );
    expect(notice).toMatchObject({ chip: "Not on WhatsApp", callOwner: true, humanId: "h1" });
  });
});
