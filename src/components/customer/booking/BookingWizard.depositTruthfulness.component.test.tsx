import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  createMany: vi.fn(),
  listOnDateForCapacity: vi.fn(),
  listBlockedSeats: vi.fn(),
  listImmediateSlots: vi.fn(),
  getDepositSettings: vi.fn(),
  listForHuman: vi.fn(),
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
}));

vi.mock("../../../engine/capacity", () => ({
  findGroupedSlots: vi.fn(() => [allocation]),
}));

vi.mock("../../../supabase/rpc", () => ({
  getCustomerBookingRules: (client: { rpc: (name: string) => unknown }) =>
    client.rpc("current_customer_booking_rules"),
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
vi.mock("../AddToCalendarButton", () => ({
  AddToCalendarButton: () => null,
}));
vi.mock("../../ui/ScribbleUnderline.jsx", () => ({
  ScribbleUnderline: () => null,
}));

import { BookingWizard } from "./BookingWizard";

describe("BookingWizard deposit truthfulness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.listOnDateForCapacity.mockResolvedValue({
      bookings: [],
      error: null,
    });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.createMany.mockResolvedValue({ ids: ["booking-1"], error: null });
    mocks.getDepositSettings.mockResolvedValue({
      bank: {
        accountName: "Smarter Dog",
        sortCode: "01-02-03",
        accountNumber: "12345678",
      },
      releaseHours: 12,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        deposit_required: true,
        deposit_reference: "SDG-7K3M",
        deposit_due_by: "2099-06-14T09:00:00Z",
        deposit_amount: 10,
      },
      error: null,
    });
    mocks.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mocks.maybeSingle,
        })),
      })),
    });
  });

  it("presents a deposit hold without saying the appointment is confirmed", async () => {
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

    await user.click(
      await screen.findByRole("button", { name: "Confirm appointment" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deposit needed" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/holding Alfie.s appointment/i)).toBeInTheDocument();
    const notice = screen.getByRole("status", { name: "Deposit needed" });
    expect(notice).toHaveTextContent(
      /please send the £10 deposit by .* using reference SDG-7K3M to hold this appointment/i,
    );
    expect(notice).toHaveTextContent(
      /if we can.t match it by then, the appointment will be released automatically/i,
    );
    expect(screen.queryByRole("heading", { name: "All booked in!" })).toBeNull();
    expect(screen.queryByText(/can.t wait to see/i)).toBeNull();
    expect(screen.queryByText(/confirmed once your deposit arrives/i)).toBeNull();
    await waitFor(() => expect(mocks.createMany).toHaveBeenCalledTimes(1));
  });

  it("fails honest when the new booking's deposit status cannot be checked", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "temporary read failure" },
    });
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

    await user.click(
      await screen.findByRole("button", { name: "Confirm appointment" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Appointment saved" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/check your dashboard for any deposit step/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "All booked in!" })).toBeNull();
    expect(screen.queryByText(/can.t wait to see/i)).toBeNull();
  });
});
