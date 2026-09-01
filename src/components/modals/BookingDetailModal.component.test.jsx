// Smoke-level tests for BookingDetailModal. The component is 811 LoC
// and lazy-renders four sibling modals; this test exercises the
// non-edit happy path so the planned nested-modal hoist (register
// item #9) has a baseline.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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

vi.mock("../../supabase/hooks/useStaffName", () => ({
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

  it("shows the owner's trusted humans on the appointment card", () => {
    const mark = {
      ...human,
      id: "human-2",
      fullName: "Mark Smith",
      name: "Mark",
      surname: "Smith",
      phone: "07700900222",
    };
    const sarah = {
      ...human,
      trustedContacts: [
        {
          id: "human-2",
          fullName: "Mark Smith",
          relationship: "Dog walker",
        },
      ],
    };

    renderModal({
      humans: { "Sarah Jones": sarah, "Mark Smith": mark },
    });

    expect(screen.getByText("Trusted humans")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Smith" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Relationship for Mark Smith" }),
    ).toHaveValue("Dog walker");
  });

  it("adds a new trusted human from the appointment card", async () => {
    const onAddHuman = vi.fn().mockResolvedValue({
      ...human,
      id: "human-2",
      fullName: "Mark Smith",
      name: "Mark",
      surname: "Smith",
      phone: "+447700900222",
      trustedContacts: [],
    });
    const onUpdateHuman = vi.fn().mockResolvedValue({ id: "saved" });

    renderModal({
      onAddHuman,
      onUpdateHuman,
      findHumanByFullName: vi.fn().mockResolvedValue(null),
    });

    const panel = screen.getByRole("region", { name: "Trusted humans" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add" }));
    fireEvent.click(
      within(panel).getByRole("button", { name: /Create new human/i }),
    );
    fireEvent.change(within(panel).getByPlaceholderText("First name"), {
      target: { value: "Mark" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("Surname"), {
      target: { value: "Smith" },
    });
    fireEvent.change(within(panel).getByPlaceholderText("Phone number"), {
      target: { value: "07700900222" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Trusted human added")).toBeInTheDocument();
  });

  it("hydrates the owner's shared trusted-human record when the appointment opens", async () => {
    const fetchHumanById = vi.fn().mockResolvedValue(human);

    renderModal({ fetchHumanById });

    await waitFor(() =>
      expect(fetchHumanById).toHaveBeenCalledWith("human-1"),
    );
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

  it("passes humans to the appointment pick-up field", () => {
    const dave = {
      ...human,
      id: "human-2",
      fullName: "Dave Smith",
      name: "Dave",
      surname: "Smith",
    };
    const sarah = { ...human, trustedIds: ["human-2"] };

    renderModal({ humans: { "Sarah Jones": sarah, "Dave Smith": dave } });
    fireEvent.click(screen.getByRole("button", { name: "Edit booking" }));

    const pickupSelect = screen.getByRole("combobox", { name: "Pick-up person" });
    expect(within(pickupSelect).getByRole("option", { name: "Dave Smith" })).toHaveValue("human-2");
  });

  // Regression: changing the pick-up human must persist the NEW human's id,
  // not the stale one carried over by the `...booking` spread. updateBooking
  // resolves pickup_by_id from `_pickupById` first, so the save mapper has to
  // refresh that id (and the display name) from the current selection.
  it("persists the newly selected pick-up human on Save (id + name)", async () => {
    const dave = {
      ...human,
      id: "human-2",
      fullName: "Dave Smith",
      name: "Dave",
      surname: "Smith",
      phone: "07700900222",
    };
    const sarah = { ...human, trustedIds: ["human-2"] };
    const onUpdate = vi.fn().mockResolvedValue({ id: "b-1" });
    const onUpdateDog = vi.fn().mockResolvedValue({ id: "dog-1" });

    renderModal({
      humans: { "Sarah Jones": sarah, "Dave Smith": dave },
      onUpdate,
      onUpdateDog,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit booking" }));

    // The pick-up <select> is the combobox that offers Dave as an option.
    const pickupSelect = screen
      .getAllByRole("combobox")
      .find((sel) => within(sel).queryByRole("option", { name: "Dave Smith" }));
    expect(pickupSelect).toBeTruthy();

    fireEvent.change(pickupSelect, { target: { value: "human-2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _pickupById: "human-2", pickupBy: "Dave Smith" }),
      expect.anything(),
      expect.anything(),
    );
  });
});
