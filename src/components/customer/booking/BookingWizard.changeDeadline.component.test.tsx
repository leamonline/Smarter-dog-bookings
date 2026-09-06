// Does the confirm step tell a customer, before they commit, that this booking
// cannot be changed online?
//
// 2 September 2026: a customer confirmed a groom at 10:32 for 08:30 the next
// morning. That is 22h58m ahead — already inside the 24-hour change window at
// the moment she pressed the button — and she found out only when a change was
// refused 2h47m later (SDC02, logged as confirm_failed/reschedule_rule). The
// gate was right; nothing had told her.
//
// The answer is the SERVER's, for the exact date and slot in hand. These tests
// pin that: the right question is asked, a positive answer is shown, and every
// other answer — no, unreadable, switched off, failed — shows nothing rather
// than a guess.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearFunnelSession } from "../../../lib/funnelSession";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  depositRows: vi.fn(),
  listOnDateForCapacity: vi.fn(),
  listBlockedSeats: vi.fn(),
  listImmediateSlots: vi.fn(),
  getDepositSettings: vi.fn(),
  listForHuman: vi.fn(),
  changeDeadlinePreview: vi.fn(),
  // Two dogs at different times: the deadline is measured from the earlier of
  // them, so the assignments are deliberately not in chronological order.
  allocation: {
    value: {
      dropOffTime: "09:30",
      assignments: [
        { dogId: "dog-2", slot: "09:30" },
        { dogId: "dog-1", slot: "09:00" },
      ],
      groupId: "new-group",
    },
  },
}));

vi.mock("../../../supabase/customerClient", () => ({
  customerSupabase: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock("../../../hooks/useDraftPersistence", () => ({
  useDraftPersistence: () => ({ restored: null, save: vi.fn(), clear: vi.fn() }),
}));

vi.mock("../../../supabase/repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

vi.mock("../../../supabase/repositories/bookingsRepo", () => ({
  createMany: vi.fn(),
  joinWaitlist: vi.fn(),
  listOnDateForCapacity: mocks.listOnDateForCapacity,
  listBlockedSeats: mocks.listBlockedSeats,
  listImmediateSlots: mocks.listImmediateSlots,
  getDepositSettings: mocks.getDepositSettings,
  requestCustomerOverrideReschedule: vi.fn(),
  rescheduleCustomerBooking: vi.fn(),
}));

vi.mock("../../../supabase/rpc", () => ({
  getCustomerBookingRules: (client: { rpc: (name: string) => unknown }) =>
    client.rpc("current_customer_booking_rules"),
  getCustomerChangeDeadlinePreview: mocks.changeDeadlinePreview,
  logBookingDenial: vi.fn().mockResolvedValue(undefined),
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./DogSelection", () => ({
  DogSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>Next: dogs</button>
  ),
}));
vi.mock("./ServiceSelection", () => ({
  ServiceSelection: ({ onNext }: { onNext: () => void }) => (
    <button type="button" onClick={onNext}>Next: service</button>
  ),
}));
vi.mock("./DateSelection", () => ({
  DateSelection: ({
    onSelect,
    onNext,
  }: { onSelect: (d: string) => void; onNext: () => void }) => (
    <button type="button" onClick={() => { onSelect("2099-06-16"); onNext(); }}>
      Next: date
    </button>
  ),
}));
vi.mock("./SlotSelection", () => ({
  SlotSelection: ({
    onSelect,
    onNext,
  }: { onSelect: (a: unknown) => void; onNext: () => void }) => (
    <button type="button" onClick={() => { onSelect(mocks.allocation.value); onNext(); }}>
      Next: slot
    </button>
  ),
}));
// Surface the prop rather than the rendered copy: this file is about what the
// wizard decides, and BookingConfirmation's own tests cover how it reads.
vi.mock("./BookingConfirmation", () => ({
  BookingConfirmation: ({ changeAlreadyClosed }: { changeAlreadyClosed?: boolean }) => (
    <div data-testid="confirm-step" data-closed={String(Boolean(changeAlreadyClosed))} />
  ),
}));
vi.mock("../AddToCalendarButton", () => ({ AddToCalendarButton: () => null }));
vi.mock("../../ui/ScribbleUnderline.jsx", () => ({ ScribbleUnderline: () => null }));

import { BookingWizard } from "./BookingWizard";

async function walkToConfirmStep() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/customer/book"]}>
      <BookingWizard
        humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
        onComplete={() => {}}
        onCancel={() => {}}
      />
    </MemoryRouter>,
  );
  await user.click(await screen.findByText("Next: dogs"));
  await user.click(await screen.findByText("Next: service"));
  await user.click(await screen.findByText("Next: date"));
  await user.click(await screen.findByText("Next: slot"));
  return screen.findByTestId("confirm-step");
}

function preview(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      deadline: "2099-06-15T09:00:00",
      passed: true,
      allowCancellations: true,
      minCancellationHours: 24,
      ...overrides,
    },
    error: null,
  };
}

describe("BookingWizard — warning that this booking cannot be changed online", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearFunnelSession();
    mocks.allocation.value = {
      dropOffTime: "09:30",
      assignments: [
        { dogId: "dog-2", slot: "09:30" },
        { dogId: "dog-1", slot: "09:00" },
      ],
      groupId: "new-group",
    };
    mocks.rpc.mockResolvedValue({ data: { bookingHorizonDays: 180 }, error: null });
    mocks.listForHuman.mockResolvedValue({
      dogs: [
        { id: "dog-1", name: "Alfie", breed: "Poodle", size: "small", reportedSize: "small", isPregnant: false },
        { id: "dog-2", name: "Tipi", breed: "Poodle", size: "small", reportedSize: "small", isPregnant: false },
      ],
      error: null,
    });
    mocks.listOnDateForCapacity.mockResolvedValue({ bookings: [], error: null });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.getDepositSettings.mockResolvedValue({ bank: null, releaseHours: 12 });
    mocks.depositRows.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ in: mocks.depositRows })) });
    mocks.changeDeadlinePreview.mockResolvedValue(preview());
  });

  it("asks the server about the exact date and the EARLIEST slot of the visit", async () => {
    await walkToConfirmStep();

    await waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
    // 09:00, not the 09:30 drop-off time: cancel_customer_booking scopes to
    // the visit and measures from min(date + slot), so a group closes on its
    // first dog. Asking about 09:30 would under-report by half an hour.
    expect(mocks.changeDeadlinePreview.mock.calls[0][1]).toEqual({
      bookingDate: "2099-06-16",
      slot: "09:00",
    });
  });

  it("warns when the server says the deadline has passed", async () => {
    const step = await walkToConfirmStep();

    await waitFor(() => expect(step).toHaveAttribute("data-closed", "true"));
  });

  it("stays quiet when the deadline has not passed", async () => {
    mocks.changeDeadlinePreview.mockResolvedValue(preview({ passed: false }));

    const step = await walkToConfirmStep();

    await waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
    expect(step).toHaveAttribute("data-closed", "false");
  });

  it("stays quiet when online cancellation is switched off entirely", async () => {
    // Nobody can change anything online, so singling out this booking is noise.
    mocks.changeDeadlinePreview.mockResolvedValue(
      preview({ passed: true, allowCancellations: false }),
    );

    const step = await walkToConfirmStep();

    await waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
    expect(step).toHaveAttribute("data-closed", "false");
  });

  it("stays quiet when the read fails", async () => {
    // Fail-quiet, not fail-loud: the gate is unaffected, and a warning we
    // cannot substantiate is worse than the generic sentence.
    mocks.changeDeadlinePreview.mockResolvedValue({
      data: null,
      error: { message: "network" },
    });

    const step = await walkToConfirmStep();

    await waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
    expect(step).toHaveAttribute("data-closed", "false");
  });

  it("stays quiet when the payload is missing a field", async () => {
    // A half-formed answer is not an answer. parseChangeDeadlinePreview drops
    // it, and the wizard must not read the absence as "closed".
    mocks.changeDeadlinePreview.mockResolvedValue({
      data: { passed: true, allowCancellations: true },
      error: null,
    });

    const step = await walkToConfirmStep();

    await waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
    expect(step).toHaveAttribute("data-closed", "false");
  });
});
