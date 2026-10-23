// What does the receipt tell a customer to do if they need to change the
// booking they have just made?
//
// It used to say "Message us on WhatsApp" whatever the facts, although the
// dashboard can move or cancel a booking itself. The answer now follows the
// server, exactly as the confirm step's warning does: point at the dashboard
// only when the server said this booking can still be changed online, point
// at WhatsApp when it said it cannot, and offer both when nobody knows.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  changeDeadlinePreview: vi.fn(),
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
    restored: {
      step: 5,
      selectedDogs: [{ dogId: "dog-1", name: "Alfie", size: "small" }],
      services: { "dog-1": "full-groom" },
      selectedDate: "2099-06-15",
      slotAllocation: allocation,
    },
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
  listDepositStamps: async (
    client: { from: (table: string) => { select: (cols: string) => { in: (col: string, ids: string[]) => Promise<{ data: unknown[] | null; error: Error | null }> } } },
    ids: string[],
  ) => {
    const { data, error } = await client
      .from("bookings")
      .select("deposit_required, deposit_reference, deposit_due_by, deposit_amount")
      .in("id", ids);
    return { rows: data ?? [], error: error ?? null };
  },
}));

vi.mock("../../../engine/capacity", () => ({
  findGroupedSlots: vi.fn(() => [allocation]),
}));

vi.mock("../../../supabase/rpc", () => ({
  getCustomerBookingRules: (client: { rpc: (name: string) => unknown }) =>
    client.rpc("current_customer_booking_rules"),
  getCustomerChangeDeadlinePreview: mocks.changeDeadlinePreview,
  logBookingDenial: vi.fn().mockResolvedValue(undefined),
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

function preview(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      deadline: "2099-06-14T09:00:00",
      passed: false,
      allowCancellations: true,
      minCancellationHours: 24,
      ...overrides,
    },
    error: null,
  };
}

async function bookAndReadFootnote() {
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
  // Let the server's change-deadline answer arrive before confirming, as it
  // does for a real customer reading the confirm step.
  await vi.waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
  await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
  await screen.findByRole("heading", { name: "All booked in!" });
  return screen.getByText(/need to change something|too close to the day/i);
}

describe("BookingWizard — receipt guidance for changing the booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.rpc.mockResolvedValue({ data: { bookingHorizonDays: 180 }, error: null });
    mocks.listForHuman.mockResolvedValue({
      dogs: [
        { id: "dog-1", name: "Alfie", breed: "Poodle", size: "small", reportedSize: "small", isPregnant: false },
      ],
      error: null,
    });
    mocks.listOnDateForCapacity.mockResolvedValue({ bookings: [], error: null });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.createMany.mockResolvedValue({ ids: ["booking-1"], error: null });
    mocks.getDepositSettings.mockResolvedValue({ bank: null, releaseHours: 12 });
    mocks.depositRows.mockResolvedValue({
      data: [
        { deposit_required: false, deposit_reference: null, deposit_due_by: null, deposit_amount: null },
      ],
      error: null,
    });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ in: mocks.depositRows })) });
    mocks.changeDeadlinePreview.mockResolvedValue(preview());
  });

  it("points to the dashboard when the server says it can still be changed online", async () => {
    const footnote = await bookAndReadFootnote();

    expect(footnote).toHaveTextContent(/move or cancel it from your dashboard/i);
    expect(footnote).not.toHaveTextContent(/whatsapp/i);
  });

  it("points to WhatsApp when the server says the deadline has already passed", async () => {
    mocks.changeDeadlinePreview.mockResolvedValue(preview({ passed: true }));

    const footnote = await bookAndReadFootnote();

    expect(footnote).toHaveTextContent(/too close to the day to change online/i);
    expect(footnote).toHaveTextContent(/message us on whatsapp/i);
    expect(footnote).not.toHaveTextContent(/dashboard/i);
  });

  it("points to WhatsApp when online changes are switched off", async () => {
    mocks.changeDeadlinePreview.mockResolvedValue(
      preview({ passed: false, allowCancellations: false }),
    );

    const footnote = await bookAndReadFootnote();

    expect(footnote).toHaveTextContent(/message us on whatsapp/i);
    expect(footnote).not.toHaveTextContent(/dashboard/i);
  });

  it("offers both routes when the server's answer is unknown", async () => {
    mocks.changeDeadlinePreview.mockResolvedValue({ data: null, error: { message: "network" } });

    const footnote = await bookAndReadFootnote();

    expect(footnote).toHaveTextContent(/dashboard/i);
    expect(footnote).toHaveTextContent(/whatsapp/i);
  });

  it("still promises the reminder text the day before", async () => {
    const footnote = await bookAndReadFootnote();

    expect(footnote).toHaveTextContent(/text a reminder the day before/i);
  });
});
