// Characterisation tests for BookingDetailModal ahead of the Debt #9
// split (lazy nested modals + card extraction). These pin the surfaces
// that are about to move:
//   - the four nested modals mount only after their trigger is used
//   - the exit-confirm flow guards unsaved edits
//   - the appointment/services/payments cards and audit footers render
// Written against pre-refactor behaviour; async findBy* queries are used
// for modal appearance so the same assertions hold once mounting is lazy.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

vi.mock("../../hooks/useGroomPhotos", () => ({
  useGroomPhotos: () => ({
    fetchPhotosForDog: vi.fn(() => Promise.resolve([])),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    updatePhotoNotes: vi.fn(),
  }),
}));

vi.mock("../../hooks/useAutosave.js", () => ({
  useAutosave: () => ({ status: "idle", flushNow: vi.fn() }),
}));

vi.mock("../../supabase/hooks/useStaffName", () => ({
  useStaffName: () => ({ name: "" }),
}));

// RecurringBookingModal fetches its chain on mount; stub the hook so the
// series test exercises mounting, not Supabase.
vi.mock("../../supabase/hooks/useGroupBookings", () => ({
  useGroupBookings: () => ({
    chainBookings: [],
    loading: false,
    cancelBookings: vi.fn(() => Promise.resolve({ success: true })),
  }),
}));

const { BookingDetailModal } = await import("./BookingDetailModal.jsx");

const dog = {
  id: "dog-1",
  name: "Bella",
  breed: "Cockapoo",
  age: "3 yrs",
  size: "small",
  humanId: "human-1",
  _humanId: "human-1",
  alerts: [],
  groomNotes: "",
  customPrice: undefined,
};

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700900111",
  sms: true,
  whatsapp: true,
  email: "",
  fb: "",
  insta: "",
  tiktok: "",
  address: "",
  notes: "",
  historyFlag: "",
  reminderHours: 24,
  reminderChannels: ["whatsapp"],
  trustedIds: [],
  trustedContacts: [],
};

const baseBooking = {
  id: "b-1",
  dogName: "Bella",
  breed: "Cockapoo",
  size: "small",
  service: "full-groom",
  owner: "Sarah Jones",
  status: "Booked",
  slot: "09:00",
  addons: [],
  pickupBy: "Sarah Jones",
  payment: "Due at Pick-up",
  depositAmount: null,
  confirmed: false,
  dogNameSnapshot: null,
  breedSnapshot: null,
  ownerNameSnapshot: null,
  whatsappConversationId: null,
  whatsappMessageId: null,
  staffCapacityOverride: false,
  staffCapacityOverrideBy: null,
  staffCapacityOverrideAt: null,
  _dogId: "dog-1",
  _ownerId: "human-1",
  _pickupById: "human-1",
  _bookingDate: "2026-05-18",
  _groupId: null,
};

function renderModal({ booking = baseBooking, ...overrides } = {}) {
  const onClose = vi.fn();
  const props = {
    booking,
    onClose,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onOpenHuman: vi.fn(),
    onOpenDog: vi.fn(),
    onUpdate: vi.fn(),
    currentDateStr: "2026-05-18",
    currentDateObj: new Date("2026-05-18T00:00:00Z"),
    bookingsByDate: { "2026-05-18": [booking] },
    dayOpenState: { "2026-05-18": true, "2026-05-20": true },
    dogs: { Bella: dog },
    humans: { "Sarah Jones": human },
    onUpdateDog: vi.fn(),
    daySettings: {},
    ...overrides,
  };
  const result = render(
    <MemoryRouter>
      <ToastProvider>
        <BookingDetailModal {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...result, onClose, props };
}

const enterEditMode = () =>
  fireEvent.click(screen.getByRole("button", { name: "Edit booking" }));

describe("BookingDetailModal — nested modal mounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts none of the nested modals when the booking is first opened", () => {
    renderModal({
      booking: { ...baseBooking, _groupId: "chain-1" },
    });
    // Date picker
    expect(screen.queryByLabelText("Previous month")).not.toBeInTheDocument();
    // Reschedule
    expect(screen.queryByText(/Pick an available day/)).not.toBeInTheDocument();
    // Photo upload
    expect(screen.queryByText("Add Groom Photo")).not.toBeInTheDocument();
    // Recurring series
    expect(screen.queryByText(/All bookings in this recurring chain/)).not.toBeInTheDocument();
    // Exit confirm
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("opens the date picker from the edit-mode date row and applies the chosen date", async () => {
    renderModal();
    enterEditMode();
    expect(screen.queryByLabelText("Previous month")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /18 May 2026/ }));
    expect(await screen.findByLabelText("Previous month")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wednesday, 20 May 2026" }));
    expect(screen.queryByLabelText("Previous month")).not.toBeInTheDocument();
    // handleSelectDate moved the edit date; the row now reflects it.
    expect(screen.getByRole("button", { name: /20 May 2026/ })).toBeInTheDocument();
  });

  it("mounts the reschedule modal only after the Reschedule action", async () => {
    renderModal();
    expect(screen.queryByText(/Pick an available day/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reschedule booking" }));
    expect(await screen.findByText(/Pick an available day/)).toBeInTheDocument();
  });

  it("mounts the photo upload modal only after the camera button", async () => {
    renderModal();
    expect(screen.queryByText("Add Groom Photo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add groom photo" }));
    expect(await screen.findByText("Add Groom Photo")).toBeInTheDocument();
  });

  it("mounts the recurring series modal only after the series button", async () => {
    renderModal({ booking: { ...baseBooking, _groupId: "chain-1" } });
    expect(screen.queryByText(/All bookings in this recurring chain/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Part of recurring series/ }));
    expect(await screen.findByText(/All bookings in this recurring chain/)).toBeInTheDocument();
  });

  it("hides the recurring series button when the booking has no group", () => {
    renderModal();
    expect(screen.queryByText(/Part of recurring series/)).not.toBeInTheDocument();
  });
});

describe("BookingDetailModal — exit confirm flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Escape closes immediately when not editing", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Close during editing shows the exit confirm instead of closing", () => {
    const { onClose } = renderModal();
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: "Close booking details" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape during editing shows the exit confirm instead of closing", () => {
    const { onClose } = renderModal();
    enterEditMode();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Keep editing dismisses the confirm and stays in edit mode", () => {
    const { onClose } = renderModal();
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: "Close booking details" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // Still editing: the service select is on screen.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  it("Discard closes the booking detail", () => {
    const { onClose } = renderModal();
    enterEditMode();
    fireEvent.click(screen.getByRole("button", { name: "Close booking details" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("BookingDetailModal — card surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("read mode shows the appointment, total and action rows", () => {
    renderModal();
    expect(screen.getByText("Time & Date")).toBeInTheDocument();
    expect(screen.getByText(/09:00 ·/)).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    // Full Groom small = £42 with nothing paid (header echo + integrated total row).
    expect(screen.getAllByText("£42").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reschedule booking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete booking permanently" })).toBeInTheDocument();
  });

  it("edit mode surfaces the slot grid and save/cancel actions", () => {
    renderModal();
    enterEditMode();
    expect(screen.getByRole("button", { name: "08:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "09:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Back to read mode.
    expect(screen.getByText("Time & Date")).toBeInTheDocument();
  });

  it("deposit-paid bookings show the deposit line and reduced total", () => {
    renderModal({
      booking: { ...baseBooking, payment: "Deposit Paid", depositAmount: 10 },
    });
    expect(screen.getByText("£10 paid · £32 to pay")).toBeInTheDocument();
    // The appointment value remains £42; £32 is left after the £10 deposit.
    expect(screen.getAllByText("£42").length).toBeGreaterThan(0);
  });

  it("WhatsApp-created bookings show the source link", () => {
    renderModal({
      booking: { ...baseBooking, whatsappConversationId: "wa-1" },
    });
    expect(
      screen.getByRole("link", { name: /Created from WhatsApp/ }),
    ).toBeInTheDocument();
  });

  it("renders the override and customer-confirmed audit footers", () => {
    renderModal({
      booking: {
        ...baseBooking,
        staffCapacityOverride: true,
        staffCapacityOverrideBy: "staff-1",
        staffCapacityOverrideAt: "2026-05-17T10:00:00Z",
        reminderConfirmedAt: "2026-05-17T11:00:00Z",
      },
    });
    expect(screen.getByText(/Capacity overridden by a staff member/)).toBeInTheDocument();
    expect(screen.getByText(/Customer confirmed via WhatsApp/)).toBeInTheDocument();
  });

  it("attributes a staff-recorded confirmation to staff, not the customer", () => {
    renderModal({
      booking: {
        ...baseBooking,
        reminderConfirmedAt: "2026-05-17T11:00:00Z",
        reminderConfirmedBy: "staff",
      },
    });
    expect(screen.getByText(/Confirmed by staff on/)).toBeInTheDocument();
    expect(screen.queryByText(/Customer confirmed via WhatsApp/)).not.toBeInTheDocument();
  });

  it("offers a pickup-ready SMS link for the pickup human", () => {
    renderModal();
    expect(
      screen.getByRole("link", { name: /Send pickup-ready SMS to Sarah Jones/ }),
    ).toBeInTheDocument();
  });

  it("uses appointment details followed by services and payment for a ready unpaid booking", () => {
    renderModal({
      booking: {
        ...baseBooking,
        size: "medium",
        status: "Ready for pick-up",
      },
    });

    const appointmentRegion = screen.getByRole("region", { name: "Appointment details" });
    const servicesPaymentRegion = screen.getByRole("region", { name: "Services & payment" });
    const regions = screen.getAllByRole("region");

    expect(appointmentRegion).toHaveTextContent("Pick-up person");
    expect(servicesPaymentRegion).toHaveTextContent("£46 to pay");
    expect(regions.indexOf(appointmentRegion)).toBeLessThan(
      regions.indexOf(servicesPaymentRegion),
    );
    expect(screen.queryByRole("region", { name: "Payment & pickup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Services & add-ons" })).not.toBeInTheDocument();
  });

  it("keeps payment collection available when a completed booking remains unpaid", () => {
    renderModal({
      booking: {
        ...baseBooking,
        size: "medium",
        status: "Completed",
      },
    });

    const servicesPaymentRegion = screen.getByRole("region", { name: "Services & payment" });
    expect(within(servicesPaymentRegion).getByText("£46 to pay")).toBeInTheDocument();
    expect(
      within(servicesPaymentRegion).getByRole("button", {
        name: "Record £46 cash payment",
      }),
    ).toBeInTheDocument();
    expect(
      within(servicesPaymentRegion).getByRole("button", {
        name: "Record £46 card payment",
      }),
    ).toBeInTheDocument();
  });

  it("keeps payment-state copy out of the paid booking header", () => {
    renderModal({
      booking: {
        ...baseBooking,
        size: "medium",
        payment: "Paid in Full",
        paymentMethod: "card",
        paidAmount: 46,
      },
    });

    const header = within(screen.getByRole("banner"));
    expect(header.getByText("£46")).toBeInTheDocument();
    expect(header.queryByText(/Paid|due/i)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Services & payment" })).getByText(
        "Paid £46 · Card",
      ),
    ).toBeInTheDocument();
  });
});
