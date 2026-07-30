import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  cancelCustomerBooking: vi.fn(),
  rescheduleCustomerBooking: vi.fn(),
  requestCustomerOverrideReschedule: vi.fn(),
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

vi.mock("../../../supabase/customerClient", () => ({
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
  rescheduleCustomerBooking: mocks.rescheduleCustomerBooking,
  requestCustomerOverrideReschedule: mocks.requestCustomerOverrideReschedule,
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
    mocks.rescheduleCustomerBooking.mockResolvedValue({
      ids: ["50000000-0000-4000-8000-000000000001"],
      error: null,
    });
    mocks.requestCustomerOverrideReschedule.mockResolvedValue({
      request: {
        requestId: "51000000-0000-4000-8000-000000000001",
        status: "pending_staff",
        replayed: false,
      },
      error: null,
    });
    mocks.cancelCustomerBooking.mockResolvedValue({
      receipt: null,
      error: { code: "SDC03", message: "not_cancellable" },
    });
    mocks.listIdsInGroup.mockResolvedValue(["old-1"]);
    mocks.cancelMany.mockResolvedValue({ error: new Error("not cancellable") });
  });

  it("submits a reschedule as one atomic command", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/customer/book",
            search: "?reschedule=40000000-0000-4000-8000-000000000001",
            state: {
              rescheduleFrom: {
                id: "40000000-0000-4000-8000-000000000001",
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

    await waitFor(() =>
      expect(mocks.rescheduleCustomerBooking).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          bookingId: "40000000-0000-4000-8000-000000000001",
          bookingDate: "2099-06-15",
        }),
      ),
    );
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.cancelCustomerBooking).not.toHaveBeenCalled();
  });

  it("fails closed when route state has no durable reschedule ID", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/customer/book",
            state: {
              rescheduleFrom: {
                id: "40000000-0000-4000-8000-000000000001",
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /reschedule link isn.t valid/i,
    );
    expect(
      screen.queryByRole("button", { name: "Confirm replacement" }),
    ).not.toBeInTheDocument();
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.rescheduleCustomerBooking).not.toHaveBeenCalled();
  });

  it("keeps reschedule mode after route state is lost on refresh", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/customer/book?reschedule=40000000-0000-4000-8000-000000000001",
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

    await waitFor(() =>
      expect(mocks.rescheduleCustomerBooking).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          bookingId: "40000000-0000-4000-8000-000000000001",
        }),
      ),
    );
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.cancelCustomerBooking).not.toHaveBeenCalled();
  });

  it("submits an overridden booking as a staff approval request", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/customer/book?reschedule=40000000-0000-4000-8000-000000000001&approval=request",
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

    await waitFor(() =>
      expect(mocks.requestCustomerOverrideReschedule).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          bookingId: "40000000-0000-4000-8000-000000000001",
          bookingDate: "2099-06-15",
        }),
      ),
    );
    expect(mocks.rescheduleCustomerBooking).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Request sent" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/original appointment stays booked/i)).toBeInTheDocument();
  });

  it("does not enter request mode without a durable reschedule ID", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/customer/book?approval=request"]}>
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

    await waitFor(() => expect(mocks.createMany).toHaveBeenCalledTimes(1));
    expect(mocks.requestCustomerOverrideReschedule).not.toHaveBeenCalled();
    expect(mocks.rescheduleCustomerBooking).not.toHaveBeenCalled();
  });
});
