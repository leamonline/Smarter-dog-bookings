// Smoke-level tests for the DogCardModal. The component is 755 LoC
// with 19 useState declarations and pulls in a chain-booking modal
// lazily — the goal here is to lock current behaviour so the upcoming
// extraction can be verified end-to-end, not to cover every branch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

vi.mock("../../hooks/useGroomPhotos.js", () => ({
  useGroomPhotos: () => ({
    fetchPhotosForDog: vi.fn(() => Promise.resolve([])),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    updatePhotoNotes: vi.fn(),
  }),
}));

const { DogCardModal } = await import("./DogCardModal.jsx");

const dog = {
  id: "dog-1",
  name: "Bella",
  breed: "Cockapoo",
  age: "3 yrs",
  size: "small",
  humanId: "human-1",
  _humanId: "human-1",
  alerts: [],
  groomNotes: "Teddy bear cut, short on ears.",
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
  reminderChannels: [],
  trustedIds: [],
  trustedContacts: [],
};

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const props = {
    dogId: "dog-1",
    onClose,
    onOpenHuman: vi.fn(),
    dogs: { Bella: dog },
    humans: { "Sarah Jones": human },
    onUpdateDog: vi.fn(),
    onUpdateHuman: vi.fn(),
    onAddHuman: vi.fn(),
    onDeleteDog: vi.fn(),
    bookingsByDate: {},
    fetchBookingHistoryForDog: vi.fn(() => Promise.resolve([])),
    fetchDogById: vi.fn(() => Promise.resolve(null)),
    handleAdd: vi.fn(),
    findHumanByFullName: vi.fn(() => null),
    searchHumansByTerm: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <DogCardModal {...props} />
    </ToastProvider>,
  );
  return { ...result, onClose, props };
}

describe("DogCardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the dog name and breed in the header on first paint", () => {
    renderModal();
    expect(screen.getByText("Bella")).toBeInTheDocument();
    // Subtitle is "<Breed> · <Age>"; just check the breed is in there.
    expect(screen.getByText(/Cockapoo/)).toBeInTheDocument();
  });

  it("exposes a Close affordance that fires onClose", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("entering edit mode reveals an editable name input pre-populated with the dog name", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Edit Bella" }));
    const nameInput = screen.getByRole("textbox", { name: "Dog name" });
    expect(nameInput).toHaveValue("Bella");
  });

  it("archiving from edit mode soft-archives via onUpdateDog and closes", async () => {
    const onUpdateDog = vi.fn(() => Promise.resolve());
    const { onClose } = renderModal({ onUpdateDog });
    fireEvent.click(screen.getByRole("button", { name: "Edit Bella" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive this dog" }));
    expect(onUpdateDog).toHaveBeenCalledWith(
      "dog-1",
      expect.objectContaining({ archivedAt: expect.any(String) }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("still offers a permanent delete as a secondary action in edit mode", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Edit Bella" }));
    expect(screen.getByRole("button", { name: "Delete permanently…" })).toBeInTheDocument();
  });
});
