import { describe, expect, it } from "vitest";
import {
  buildActiveRequestQueue,
  buildBookingRequest,
  isActiveAppointmentRequest,
  toggleDraftSlot,
} from "./bookingWorkspaceModel.js";

const NOW = new Date("2026-08-01T12:00:00.000Z").getTime();

function conversation(overrides = {}) {
  return {
    id: "conversation-1",
    channel: "whatsapp",
    closed_at: null,
    human_id: "human-1",
    humans: {
      name: "Sarah",
      surname: "Jones",
      dogs: [{ id: "dog-1", name: "Luna", breed: "Cockapoo", size: "small" }],
    },
    agent_state: {
      dogName: "Luna",
      service: "full-groom",
      preferredDay: "Wednesday",
    },
    last_customer_text: "Could I book a Wednesday appointment?",
    last_inbound_at: "2026-08-01T11:42:00.000Z",
    last_outbound_at: "2026-08-01T10:00:00.000Z",
    whatsapp_drafts: [],
    whatsapp_booking_actions: [],
    ...overrides,
  };
}

describe("Booking Desk request derivation", () => {
  it("includes structured active booking conversations", () => {
    expect(isActiveAppointmentRequest(conversation())).toBe(true);
  });

  it("keeps general, cancellation and reschedule conversations out", () => {
    expect(
      isActiveAppointmentRequest(
        conversation({ agent_state: {}, last_customer_text: "What time do you close?" }),
      ),
    ).toBe(false);
    expect(
      isActiveAppointmentRequest(
        conversation({ last_customer_text: "Please cancel my existing booking" }),
      ),
    ).toBe(false);
    expect(
      isActiveAppointmentRequest(
        conversation({ last_customer_text: "Can I reschedule my appointment?" }),
      ),
    ).toBe(false);
  });

  it("includes an exact pending create action without relying on message keywords", () => {
    expect(
      isActiveAppointmentRequest(
        conversation({
          agent_state: {},
          last_customer_text: "Yes please",
          pending_booking_action: {
            id: "action-1",
            state: "pending",
            action: "create",
            payload: {
              dog_id: "dog-1",
              booking_date: "2026-08-03",
              slot: "10:30",
              service: "full-groom",
              size: "small",
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it("never guesses an unknown dog size", () => {
    const request = buildBookingRequest(
      conversation({
        humans: { name: "Sarah", surname: "Jones", dogs: [] },
        agent_state: {
          dogName: "Luna",
          dogSize: "unknown",
          service: "full-groom",
          preferredDay: "Wednesday",
        },
      }),
      NOW,
    );
    expect(request.size).toBeNull();
  });

  it("does not treat a conversation or proposal size as authoritative", () => {
    const request = buildBookingRequest(
      conversation({
        humans: { name: "Sarah", surname: "Jones", dogs: [] },
        agent_state: {
          dogName: "Luna",
          dogSize: "small",
          service: "full-groom",
        },
        pending_booking_action: {
          id: "action-untrusted-size",
          state: "pending",
          action: "create",
          payload: { service: "full-groom", size: "small" },
        },
      }),
      NOW,
    );

    expect(request.size).toBeNull();
    expect(request.status).toBe("Needs details");
  });

  it("sorts ready-to-confirm and needs-reply work ahead of waiting customers", () => {
    const queue = buildActiveRequestQueue(
      [
        conversation({ id: "waiting", last_outbound_at: "2026-08-01T11:50:00.000Z" }),
        conversation({ id: "reply" }),
        conversation({
          id: "ready",
          pending_booking_action: {
            id: "action-2",
            state: "pending",
            action: "create",
            payload: { dog_id: "dog-1", service: "full-groom", size: "small" },
          },
        }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.id)).toEqual(["ready", "reply", "waiting"]);
  });
});

describe("Booking Desk draft slots", () => {
  it("adds, removes and caps the session draft at three times", () => {
    const a = { dateStr: "2026-08-03", slot: "10:30" };
    const b = { dateStr: "2026-08-04", slot: "09:00" };
    const c = { dateStr: "2026-08-05", slot: "11:00" };
    const d = { dateStr: "2026-08-05", slot: "12:00" };

    const one = toggleDraftSlot([], a);
    const two = toggleDraftSlot(one.choices, b);
    const three = toggleDraftSlot(two.choices, c);
    const capped = toggleDraftSlot(three.choices, d);
    const removed = toggleDraftSlot(three.choices, b);

    expect(capped.atLimit).toBe(true);
    expect(capped.choices).toHaveLength(3);
    expect(removed.atLimit).toBe(false);
    expect(removed.choices).toEqual([a, c]);
  });
});
