// The booked moment (flyer visual language, decisions 9 and 10): the dog's own
// photo in the taped polaroid, the service mascot on its corner, and one
// handwritten line. The photo used to be lost on the way: the wizard copied
// only some of each dog's fields, so the polaroid never had a path to show.
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

// Signing a storage URL is the photo hook's job; here a path simply becomes a URL.
vi.mock("../../../supabase/hooks/useCustomerDogPhoto", () => ({
  useDogPhotoUrl: (path: string | null | undefined) => ({
    url: path ? `https://photos.test/${path}` : null,
    onLoadError: () => {},
  }),
}));

import { BookingWizard } from "./BookingWizard";

async function book() {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={["/customer/book"]}>
      <BookingWizard
        humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
        onComplete={() => {}}
        onCancel={() => {}}
      />
    </MemoryRouter>,
  );
  await vi.waitFor(() => expect(mocks.changeDeadlinePreview).toHaveBeenCalled());
  await user.click(await screen.findByRole("button", { name: "Confirm appointment" }));
  await screen.findByRole("heading", { name: "All booked in!" });
  return view.container;
}

function dogs(photoPath: string | null) {
  return {
    dogs: [
      { id: "dog-1", name: "Alfie", breed: "Poodle", size: "small", reportedSize: "small", isPregnant: false, photoPath },
    ],
    error: null,
  };
}

describe("BookingWizard — the booked moment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.rpc.mockResolvedValue({ data: { bookingHorizonDays: 180 }, error: null });
    mocks.listOnDateForCapacity.mockResolvedValue({ bookings: [], error: null });
    mocks.listBlockedSeats.mockResolvedValue({ byDate: {} });
    mocks.listImmediateSlots.mockResolvedValue({ date: null, slots: [] });
    mocks.createMany.mockResolvedValue({ ids: ["booking-1"], error: null });
    mocks.getDepositSettings.mockResolvedValue({ bank: null, releaseHours: 12 });
    mocks.depositRows.mockResolvedValue({
      data: [{ deposit_required: false, deposit_reference: null, deposit_due_by: null, deposit_amount: null }],
      error: null,
    });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ in: mocks.depositRows })) });
    mocks.changeDeadlinePreview.mockResolvedValue({
      data: { deadline: "2099-06-14T09:00:00", passed: false, allowCancellations: true, minCancellationHours: 24 },
      error: null,
    });
  });

  it("frames the dog's own photo in the polaroid, with the service mascot on its corner", async () => {
    mocks.listForHuman.mockResolvedValue(dogs("human-1/alfie.jpg"));
    const container = await book();

    const photo = container.querySelector(".booking-success-polaroid-photo img");
    expect(photo).not.toBeNull();
    expect(photo).toHaveAttribute("src", "https://photos.test/human-1/alfie.jpg");
    expect(photo).toHaveAttribute("alt", "");
    expect(container.querySelector('[data-service-mascot="full-groom"]')).not.toBeNull();
    expect(container.querySelector(".booking-success-figure")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the paw placeholder when the dog has no photo", async () => {
    mocks.listForHuman.mockResolvedValue(dogs(null));
    const container = await book();

    expect(container.querySelector(".booking-success-polaroid-photo img")).toBeNull();
    expect(container.querySelector('[data-service-mascot="full-groom"]')).not.toBeNull();
  });

  it("adds one handwritten line and draws the swash in, with no looping animation", async () => {
    mocks.listForHuman.mockResolvedValue(dogs(null));
    const container = await book();

    expect(screen.getByText("See you soon!")).toHaveClass("booking-success-hand");
    expect(container.querySelector(".booking-success-title .scribble-underline--draw")).not.toBeNull();
    expect(container.querySelector(".booking-success-paws")).toBeNull();
  });
});
