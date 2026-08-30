// Booking-funnel telemetry regression tests (improvement #4). These pin the
// fixes for the three production bugs: a remount must NOT mint a new
// session_id or re-log "started" (bug A / C), every event must carry a
// strictly increasing step index (bug B), and completing a booking must end
// the attempt so the next one starts fresh.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FUNNEL_SESSION_KEY, clearFunnelSession } from "../../../lib/funnelSession";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  depositRows: vi.fn(),
  createMany: vi.fn(),
  listOnDateForCapacity: vi.fn(),
  listBlockedSeats: vi.fn(),
  listImmediateSlots: vi.fn(),
  getDepositSettings: vi.fn(),
  listForHuman: vi.fn(),
  logFunnelEvent: vi.fn(),
  // Mutable per-test draft returned by the useDraftPersistence mock.
  draft: { value: null as unknown },
}));

const allocation = {
  dropOffTime: "09:00",
  assignments: [{ dogId: "dog-1", slot: "09:00" }],
  groupId: "new-group",
};

vi.mock("../../../supabase/customerClient", () => ({
  customerSupabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

vi.mock("../../../hooks/useDraftPersistence.js", () => ({
  useDraftPersistence: () => ({
    restored: mocks.draft.value,
    save: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("../../../supabase/repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

vi.mock("../../../supabase/repositories/bookingsRepo", () => ({
  createMany: mocks.createMany,
  joinWaitlist: vi.fn(),
  listOnDateForCapacity: mocks.listOnDateForCapacity,
  listBlockedSeats: mocks.listBlockedSeats,
  listImmediateSlots: mocks.listImmediateSlots,
  getDepositSettings: mocks.getDepositSettings,
  requestCustomerOverrideReschedule: vi.fn(),
  rescheduleCustomerBooking: vi.fn(),
}));

vi.mock("../../../engine/capacity", () => ({
  findGroupedSlots: vi.fn(() => [allocation]),
}));

vi.mock("../../../supabase/rpc", () => ({
  getCustomerBookingRules: (client: { rpc: (name: string) => unknown }) =>
    client.rpc("current_customer_booking_rules"),
  logBookingDenial: vi.fn().mockResolvedValue(undefined),
  logFunnelEvent: mocks.logFunnelEvent,
}));

vi.mock("./DogSelection", () => ({
  DogSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>
      Next: dogs
    </button>
  ),
}));
vi.mock("./ServiceSelection", () => ({
  ServiceSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>
      Next: service
    </button>
  ),
}));
vi.mock("./DateSelection", () => ({
  DateSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>
      Next: date
    </button>
  ),
}));
vi.mock("./SlotSelection", () => ({
  SlotSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>
      Next: slot
    </button>
  ),
}));
vi.mock("./BookingConfirmation", () => ({
  BookingConfirmation: ({ onConfirm }: { onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>
      Confirm appointment
    </button>
  ),
}));
vi.mock("../AddToCalendarButton", () => ({
  AddToCalendarButton: () => null,
}));
vi.mock("../../ui/ScribbleUnderline.jsx", () => ({
  ScribbleUnderline: () => null,
}));

import { BookingWizard } from "./BookingWizard";

interface FunnelCall {
  step: string;
  sessionId: string;
  stepIndex?: number | null;
  occurredAt?: string | null;
  failureCode?: string | null;
  failureDetail?: string | null;
}

function funnelCalls(): FunnelCall[] {
  return mocks.logFunnelEvent.mock.calls.map((call) => call[1] as FunnelCall);
}

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/customer/book"]}>
      <BookingWizard
        humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
        onComplete={() => {}}
        onCancel={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("BookingWizard funnel telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearFunnelSession();
    mocks.draft.value = null;
    mocks.logFunnelEvent.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({
      data: { bookingHorizonDays: 180 },
      error: null,
    });
    mocks.listForHuman.mockResolvedValue({
      dogs: [
        {
          id: "dog-1",
          name: "Alfie",
          breed: "Poodle",
          size: "small",
          reportedSize: "small",
          isPregnant: false,
        },
      ],
      error: null,
    });
    mocks.listOnDateForCapacity.mockResolvedValue({ bookings: [], error: null });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.createMany.mockResolvedValue({ ids: ["booking-1"], error: null });
    mocks.getDepositSettings.mockResolvedValue({
      bank: { accountName: "Smarter Dog", sortCode: "01-02-03", accountNumber: "12345678" },
      releaseHours: 12,
    });
    mocks.depositRows.mockResolvedValue({
      data: [
        {
          deposit_required: false,
          deposit_reference: null,
          deposit_due_by: null,
          deposit_amount: null,
        },
      ],
      error: null,
    });
    mocks.from.mockReturnValue({
      select: vi.fn(() => ({
        in: mocks.depositRows,
      })),
    });
  });

  it("does not mint a new session id or re-log started on remount", async () => {
    const first = renderWizard();
    await waitFor(() => expect(mocks.logFunnelEvent).toHaveBeenCalled());
    first.unmount();
    const second = renderWizard();
    await screen.findByRole("button", { name: "Next: dogs" });
    second.unmount();

    const startedCalls = funnelCalls().filter((c) => c.step === "started");
    expect(startedCalls).toHaveLength(1);
    // The persisted record still carries the same id the event was sent with.
    const stored = JSON.parse(sessionStorage.getItem(FUNNEL_SESSION_KEY) as string) as {
      id: string;
    };
    expect(startedCalls[0].sessionId).toBe(stored.id);
  });

  it("logs one session with strictly increasing step indexes across the whole flow", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: "Next: dogs" }));
    await user.click(await screen.findByRole("button", { name: "Next: service" }));
    await user.click(await screen.findByRole("button", { name: "Next: date" }));
    await user.click(await screen.findByRole("button", { name: "Next: slot" }));

    const calls = funnelCalls();
    expect(calls.map((c) => c.step)).toEqual([
      "started",
      "select_dogs",
      "select_service",
      "select_date",
      "select_slot",
    ]);
    expect(new Set(calls.map((c) => c.sessionId)).size).toBe(1);
    expect(calls.map((c) => c.stepIndex)).toEqual([0, 1, 2, 3, 4]);
    for (const call of calls) {
      expect(typeof call.occurredAt).toBe("string");
      expect(Number.isNaN(Date.parse(call.occurredAt as string))).toBe(false);
    }
  });

  it("logs booked once, clears the session, and the next attempt starts fresh", async () => {
    mocks.draft.value = {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    };
    const user = userEvent.setup();
    const first = renderWizard();
    await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
    await waitFor(() =>
      expect(funnelCalls().map((c) => c.step)).toContain("booked"),
    );

    const firstAttempt = funnelCalls();
    expect(firstAttempt.map((c) => c.step)).toEqual(["started", "confirm", "booked"]);
    expect(firstAttempt.map((c) => c.stepIndex)).toEqual([0, 1, 2]);
    expect(new Set(firstAttempt.map((c) => c.sessionId)).size).toBe(1);
    // The attempt ended: the stored record is gone, so nothing further can be
    // written on this session id.
    expect(sessionStorage.getItem(FUNNEL_SESSION_KEY)).toBeNull();
    first.unmount();

    // A post-booking remount is a NEW attempt: fresh id, started logs again.
    mocks.draft.value = null;
    renderWizard();
    await waitFor(() =>
      expect(funnelCalls().filter((c) => c.step === "started")).toHaveLength(2),
    );
    const [firstStarted, secondStarted] = funnelCalls().filter((c) => c.step === "started");
    expect(secondStarted.sessionId).not.toBe(firstStarted.sessionId);
    expect(secondStarted.stepIndex).toBe(0);
  });

  // #708: a confirm that produces no booking must leave a database-visible
  // confirm_failed row on the same session, carrying the governed failure
  // code — logger.error reaches nothing in production until Sentry exists.
  it("logs confirm_failed with server_error when the write path returns a coded error", async () => {
    mocks.draft.value = {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    };
    mocks.createMany.mockResolvedValue({
      ids: [],
      error: { code: "23505", message: "duplicate key value violates unique constraint", details: null },
    });
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
    await waitFor(() =>
      expect(funnelCalls().map((c) => c.step)).toContain("confirm_failed"),
    );

    const calls = funnelCalls();
    expect(calls.map((c) => c.step)).toEqual(["started", "confirm", "confirm_failed"]);
    const failed = calls[2];
    expect(failed.failureCode).toBe("server_error");
    expect(failed.failureDetail).toContain("[23505]");
    // Same attempt, ordered after the confirm it explains.
    expect(failed.sessionId).toBe(calls[1].sessionId);
    expect(failed.stepIndex).toBe(2);
    // The attempt did NOT end: the session survives so a retry stays joined.
    expect(sessionStorage.getItem(FUNNEL_SESSION_KEY)).not.toBeNull();
    expect(funnelCalls().map((c) => c.step)).not.toContain("booked");
  });

  it("logs confirm_failed with network_failed when the request never got a response", async () => {
    mocks.draft.value = {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    };
    // supabase-js surfaces a fetch rejection as a codeless wrapped message.
    mocks.listOnDateForCapacity.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
    await waitFor(() =>
      expect(funnelCalls().map((c) => c.step)).toContain("confirm_failed"),
    );
    const failed = funnelCalls().find((c) => c.step === "confirm_failed");
    expect(failed?.failureCode).toBe("network_failed");
  });
});
