// A booking failure the wizard does not recognise must be REPORTED, not
// silently swallowed.
//
// The wizard has copy for two kinds of outcome: a gate refusal (counted as
// capacity-prevented demand in booking_denials) and four known reschedule
// rejections. Everything else fell to "Sorry, we couldn't save that booking
// change. Please try again" and was recorded nowhere at all -- no denial row,
// because isTriggerError is false, and no Sentry event, because the submit
// path never called the logger even though this file imports it and
// instruments three lesser READ failures with it.
//
// Production showed what that hid. Across July and August the portal funnel
// logged 154 confirmations and 134 bookings, and the shortfall reconciles
// against real booking groups -- roughly 13% of customers who pressed Confirm
// got no appointment. booking_denials recorded two refusals in the same
// window. The largest leak in the funnel was the one nothing watched.
//
// The rule these tests pin: an unrecognised failure reaches the logger, and
// an ordinary refusal does not. A gate saying "no" is the system working, and
// paging someone for it would bury the failures that are not.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearFunnelSession } from "../../../lib/funnelSession";
import { logger } from "../../../lib/logger";

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

vi.mock("../../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const loggerError = vi.mocked(logger.error);

const SUBMIT_FAILURE = "Customer booking submission failed";

/**
 * Only the submit path's reports. The wizard also instruments two booking-rule
 * READS with logger.error, and those fire in this harness -- counting raw
 * calls would make these tests depend on unrelated noise.
 */
function submitFailures() {
  return loggerError.mock.calls.filter((call) => call[0] === SUBMIT_FAILURE);
}

describe("BookingWizard reports failures it cannot explain", () => {
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
    mocks.draft.value = {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    };
  });

  it("reports a failure that is neither a refusal nor a known reschedule code", async () => {
    // The bucket production was losing ~10 confirmations a month into.
    mocks.createMany.mockRejectedValue(new Error("Failed to fetch"));
    const shown = await confirmAndReadRefusal();

    expect(shown).toContain("we couldn’t save that booking change");
    await waitFor(() => expect(submitFailures()).toHaveLength(1));
    const [, , context] = submitFailures()[0];
    expect(context?.tags).toMatchObject({
      component: "BookingWizard",
      op: "create_customer_booking_group",
    });
  });

  it("does NOT report an ordinary gate refusal", async () => {
    // A gate saying no is the system working. It is already counted as a
    // denial; paging on it would bury the failures that are real.
    gateRejects(PROSE_SAYS_SLOT_FULL, "slot_full");
    await confirmAndReadRefusal();

    await waitFor(() => expect(mocks.logBookingDenial).toHaveBeenCalled());
    expect(submitFailures()).toEqual([]);
  });

  it("does NOT report a known reschedule rejection", async () => {
    // Each of these has its own customer copy, so it is a handled outcome.
    for (const code of ["SDC02", "SDR01", "SDR02", "SDC04"]) {
      cleanup();
      vi.clearAllMocks();
      mocks.createMany.mockResolvedValue({
        ids: [],
        error: { code, message: `${code} rejected`, details: null },
      });
      await confirmAndReadRefusal();
      expect(submitFailures(), `${code} should be a handled outcome`).toEqual([]);
    }
  });

  it("carries the shape of the attempt without naming the customer or dogs", async () => {
    // Diagnostic, and no more identifying than the denial row this failure
    // would have produced had it been a refusal.
    mocks.createMany.mockRejectedValue(new Error("Failed to fetch"));
    await confirmAndReadRefusal();

    await waitFor(() => expect(submitFailures()).toHaveLength(1));
    const extra = submitFailures()[0][2]?.extra as Record<string, unknown>;
    expect(extra).toMatchObject({ requestedDate: "2099-06-15", dogCount: 1 });
    const serialised = JSON.stringify(submitFailures()[0]);
    expect(serialised).not.toContain("Alfie");
    expect(serialised).not.toContain("human-1");
  });
});
