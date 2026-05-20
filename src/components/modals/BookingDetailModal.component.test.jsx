// Smoke-level tests for BookingDetailModal. The component is 811 LoC
// and lazy-renders four sibling modals; this test exercises the
// non-edit happy path so the planned nested-modal hoist (register
// item #9) has a baseline.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

vi.mock("../../hooks/useGroomPhotos.js", () => ({
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

vi.mock("../../supabase/hooks/useStaffName.js", () => ({
  useStaffName: () => ({ name: "" }),
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

const booking = {
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

function renderModal(overrides = {}) {
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
    dayOpenState: { "2026-05-18": true },
    dogs: { Bella: dog },
    humans: { "Sarah Jones": human },
    onUpdateDog: vi.fn(),
    onRebook: vi.fn(),
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

describe("BookingDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the dog name and breed in the header on first paint", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /Bella/ })).toBeInTheDocument();
    // Subtitle has breed; allow multiple matches because alerts /
    // grooming history may also list it.
    expect(screen.getAllByText(/Cockapoo/).length).toBeGreaterThan(0);
  });

  it("Close button fires onClose when there are no unsaved edits", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close booking details" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Edit button enters edit mode, surfacing the editable service select", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Edit booking" }));
    // In edit mode the service comes from a <select>; in read mode it's
    // a static span. The presence of a combobox is the cheapest proof.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });
});
