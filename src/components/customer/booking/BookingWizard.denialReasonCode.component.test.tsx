// The reason-code contract (#665), end to end through the portal wizard.
//
// The gates emit their reason in the exception's DETAIL since migration
// 20260826120000, and both mappers prefer it over inferring one from the
// gate's prose. But an emitted code is only worth anything if it SURVIVES the
// journey to the consumer, and on this path it did not: bookingsRepo.createMany
// narrowed the error to {code, message}, and the wizard then re-wrapped it as
// `new Error(message)` carrying only `.code`. Two independent drops, so the
// wizard ran on prose inference alone while appearing to honour the contract.
//
// That is invisible while every emitted code agrees with what the prose would
// have inferred — which is true today, and is exactly why a type error and a
// green suite were not enough to notice. It stops being invisible the first
// time someone edits a gate's wording, which is the very event the contract
// exists to make safe.
//
// So these tests drive the two apart on purpose: a message whose prose says one
// thing and a DETAIL that says another. The gate's own answer must win, in the
// sentence the customer reads AND in the reason recorded against it — the
// property the code comment in the wizard's catch block promises.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearFunnelSession } from "../../../lib/funnelSession";
import { friendlyDenialMessage } from "../../../engine/denials";

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
  logBookingDenial: vi.fn(),
  draft: { value: null as unknown },
}));

const allocation = {
  dropOffTime: "09:00",
  assignments: [{ dogId: "dog-1", slot: "09:00" }],
  groupId: "new-group",
};

vi.mock("../../../supabase/customerClient", () => ({
  customerSupabase: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock("../../../hooks/useDraftPersistence", () => ({
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
  logBookingDenial: mocks.logBookingDenial,
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./DogSelection", () => ({ DogSelection: () => null }));
vi.mock("./ServiceSelection", () => ({ ServiceSelection: () => null }));
vi.mock("./DateSelection", () => ({ DateSelection: () => null }));
vi.mock("./SlotSelection", () => ({ SlotSelection: () => null }));
vi.mock("./BookingConfirmation", () => ({
  BookingConfirmation: ({ onConfirm }: { onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>
      Confirm appointment
    </button>
  ),
}));
vi.mock("../AddToCalendarButton", () => ({ AddToCalendarButton: () => null }));
vi.mock("../../ui/ScribbleUnderline.jsx", () => ({ ScribbleUnderline: () => null }));

import { BookingWizard } from "./BookingWizard";

/** The message a real gate raises whose prose infers `slot_full`. */
const PROSE_SAYS_SLOT_FULL = "Slot is full";

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

/** Reject the insert exactly as PostgREST surfaces a raised gate exception. */
function gateRejects(message: string, details: string | null) {
  mocks.createMany.mockResolvedValue({
    ids: [],
    error: { code: "P0001", message, details },
  });
}

async function confirmAndReadRefusal(): Promise<string> {
  const user = userEvent.setup();
  renderWizard();
  await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
  const alert = await screen.findByRole("alert");
  return alert.textContent ?? "";
}

function loggedReasonCode(): string | undefined {
  const call = mocks.logBookingDenial.mock.calls[0];
  return (call?.[1] as { reasonCode?: string } | undefined)?.reasonCode;
}

describe("BookingWizard honours the emitted reason code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearFunnelSession();
    mocks.logBookingDenial.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: { bookingHorizonDays: 180 }, error: null });
    mocks.listForHuman.mockResolvedValue({
      dogs: [{ id: "dog-1", name: "Alfie", breed: "Poodle", size: "small", reportedSize: "small", isPregnant: false }],
      error: null,
    });
    mocks.listOnDateForCapacity.mockResolvedValue({ bookings: [], error: null });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.getDepositSettings.mockResolvedValue({ bank: null, releaseHours: 12 });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ in: mocks.depositRows })) });
    // Jump straight to the confirmation step; the flow itself is covered
    // elsewhere and is not what these tests are about.
    mocks.draft.value = {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    };
  });

  it("shows the copy for the EMITTED code, not the one the prose implies", async () => {
    // The drift the contract exists to survive: a gate whose wording was
    // edited, so its prose no longer implies the reason it actually applied.
    gateRejects(PROSE_SAYS_SLOT_FULL, "large_dog_ineligible");
    const shown = await confirmAndReadRefusal();

    expect(shown).toBe(friendlyDenialMessage(null, "large_dog_ineligible"));
    expect(shown).not.toBe(friendlyDenialMessage(PROSE_SAYS_SLOT_FULL));
  });

  it("records the EMITTED code against the denial", async () => {
    // Report 2F's numbers come from here. A dropped DETAIL silently
    // re-categorises capacity-prevented demand.
    gateRejects(PROSE_SAYS_SLOT_FULL, "large_dog_ineligible");
    await confirmAndReadRefusal();

    await waitFor(() => expect(mocks.logBookingDenial).toHaveBeenCalled());
    expect(loggedReasonCode()).toBe("large_dog_ineligible");
  });

  it("keeps the sentence and the logged reason in step", async () => {
    // The wizard's catch block promises these "can never drift". They are
    // computed from separate calls, so nothing but a test holds them together.
    gateRejects(PROSE_SAYS_SLOT_FULL, "large_dog_ineligible");
    const shown = await confirmAndReadRefusal();

    await waitFor(() => expect(mocks.logBookingDenial).toHaveBeenCalled());
    expect(shown).toBe(friendlyDenialMessage(null, loggedReasonCode()));
  });

  it("falls back to the prose when a gate emits no code", async () => {
    // Two raise sites are deliberately bare, and a database that predates the
    // migration emits nothing at all. Both must still work.
    gateRejects(PROSE_SAYS_SLOT_FULL, null);
    const shown = await confirmAndReadRefusal();

    expect(shown).toBe(friendlyDenialMessage(PROSE_SAYS_SLOT_FULL));
    await waitFor(() => expect(mocks.logBookingDenial).toHaveBeenCalled());
    expect(loggedReasonCode()).toBe("slot_full");
  });

  it("ignores a DETAIL that is not one of our codes", async () => {
    // DETAIL is a general-purpose PostgreSQL field — a unique-violation fills
    // it with key text. Trusting it blindly would invent a category.
    gateRejects(PROSE_SAYS_SLOT_FULL, "Key (dog_id, booking_date, slot)=(…) already exists.");
    const shown = await confirmAndReadRefusal();

    expect(shown).toBe(friendlyDenialMessage(PROSE_SAYS_SLOT_FULL));
    await waitFor(() => expect(mocks.logBookingDenial).toHaveBeenCalled());
    expect(loggedReasonCode()).toBe("slot_full");
  });
});
