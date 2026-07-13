import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  cancelCustomerBooking: vi.fn(),
  cancelMany: vi.fn(),
  listIdsInGroup: vi.fn(),
  listForHuman: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}));

const allocation = {
  dropOffTime: "09:00",
  assignments: [{ dogId: "dog-1", slot: "09:00" }],
  groupId: "replacement-group",
};

vi.mock("../../../supabase/customerClient.js", () => ({
  customerSupabase: { rpc: vi.fn() },
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
    save: mocks.saveDraft,
    clear: mocks.clearDraft,
  }),
}));

vi.mock("../../../supabase/repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

vi.mock("../../../supabase/repositories/bookingsRepo", () => ({
  createMany: mocks.createMany,
  cancelCustomerBooking: mocks.cancelCustomerBooking,
  cancelMany: mocks.cancelMany,
  listIdsInGroup: mocks.listIdsInGroup,
  listOnDateForCapacity: vi.fn().mockResolvedValue({ bookings: [], error: null }),
  listBlockedSeats: vi.fn().mockResolvedValue({ byDate: {} }),
  listImmediateSlots: vi.fn().mockResolvedValue({ date: null, slots: [] }),
  joinWaitlist: vi.fn(),
}));

vi.mock("../../../engine/capacity", () => ({
  findGroupedSlots: vi.fn(() => [allocation]),
}));

vi.mock("../../../supabase/rpc", () => ({
  logBookingDenial: vi.fn().mockResolvedValue(undefined),
  logFunnelEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./DogSelection", () => ({ DogSelection: () => null }));
vi.mock("./ServiceSelection", () => ({ ServiceSelection: () => null }));
vi.mock("./DateSelection", () => ({ DateSelection: () => null }));
vi.mock("./SlotSelection", () => ({ SlotSelection: () => null }));
vi.mock("./BookingConfirmation", () => ({
  BookingConfirmation: ({
    onConfirm,
    submitting,
  }: {
    onConfirm: () => void;
    submitting: boolean;
  }) => (
    <button type="button" onClick={onConfirm} disabled={submitting}>
      Confirm replacement
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

describe("BookingWizard partial reschedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.createMany.mockResolvedValue({ ids: ["new-1"], error: null });
    mocks.cancelCustomerBooking.mockResolvedValue({
      receipt: null,
      error: { code: "SDC03", message: "not_cancellable" },
    });
    mocks.listIdsInGroup.mockResolvedValue(["old-1"]);
    mocks.cancelMany.mockResolvedValue({ error: new Error("not cancellable") });
  });

  it("enters a terminal recovery state after replacement succeeds but cancellation fails", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/customer/book",
            state: {
              rescheduleFrom: {
                id: "old-1",
                dateLabel: "15 June",
                timeLabel: "9:00am",
                dogName: "Alfie",
              },
            },
          },
        ]}
      >
        <BookingWizard
          humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
          onComplete={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Confirm replacement" }),
    );

    expect(
      await screen.findByText(
        "Your new booking was created, but the original booking could not be cancelled. Please contact the salon so we can fix this.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn.t create that booking/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/new-1/i)).toBeInTheDocument();
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.cancelCustomerBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: "old-1" }),
    );
    expect(
      screen.queryByRole("button", { name: "Confirm replacement" }),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(mocks.createMany).toHaveBeenCalledTimes(1));
  });
});
