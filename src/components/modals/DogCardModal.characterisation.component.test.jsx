// Characterisation tests for the DogCardModal behaviours that the
// dog-card split (Debt #8) relocates: edit-save field mapping, owner
// search/link, trusted-human flows, on-demand dog resolution, photo
// gallery mounting and the chain-booking flow. Written against the
// pre-split behaviour and kept green through the refactor — these are
// behaviour pins, not aspirational specs.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BOOKING_STATUS } from "../../constants/index";

const groomPhotoMocks = vi.hoisted(() => ({
  fetchPhotosForDog: vi.fn(() => Promise.resolve([])),
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  updatePhotoNotes: vi.fn(),
}));

vi.mock("../../hooks/useGroomPhotos", () => ({
  useGroomPhotos: () => groomPhotoMocks,
}));

// Stub the chain-booking modal: the pin here is the open/launch contract
// (which dog and last booking it receives, and how onCreateChain maps
// links into handleAdd calls) — not the chain UI itself.
vi.mock("./ChainBookingModal.jsx", () => ({
  ChainBookingModal: ({ dog, lastBooking, onCreateChain, onClose }) => (
    <div data-testid="chain-booking-modal">
      <div data-testid="chain-dog-name">{dog?.name}</div>
      <div data-testid="chain-last-date">{lastBooking?.booking_date}</div>
      <button
        type="button"
        onClick={() =>
          onCreateChain([
            { size: "small", service: "full-groom", slot: "09:00", dateStr: "2026-07-01" },
            {
              size: "small",
              service: "full-groom",
              slot: "10:00",
              dateStr: "2026-07-15",
              staffCapacityOverride: true,
            },
          ])
        }
      >
        stub-create-chain
      </button>
      <button type="button" onClick={onClose}>stub-close-chain</button>
    </div>
  ),
}));

const { DogCardModal } = await import("./DogCardModal.jsx");

const baseDog = {
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

const sarah = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700900111",
  trustedContacts: [],
};

const mark = {
  id: "human-2",
  fullName: "Mark Smith",
  name: "Mark",
  surname: "Smith",
  phone: "07700900222",
  trustedContacts: [],
};

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const props = {
    dogId: "dog-1",
    onClose,
    onOpenHuman: vi.fn(),
    dogs: { Bella: baseDog },
    humans: { "Sarah Jones": sarah, "Mark Smith": mark },
    onUpdateDog: vi.fn(() => Promise.resolve()),
    // updateHuman resolves the saved human (truthy) on success / null on
    // failure; success is shown only when the owner's one-way link landed.
    onUpdateHuman: vi.fn(() => Promise.resolve({ ok: true })),
    onAddHuman: vi.fn(() => Promise.resolve(null)),
    onDeleteDog: vi.fn(),
    bookingsByDate: {},
    fetchBookingHistoryForDog: vi.fn(() => Promise.resolve([])),
    fetchDogById: vi.fn(() => Promise.resolve(null)),
    handleAdd: vi.fn(() => Promise.resolve()),
    findHumanByFullName: vi.fn(() => Promise.resolve(null)),
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

function enterEdit(name = "Bella") {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
}

function openTrustedHumanPicker() {
  const panel = screen.getByRole("region", { name: "Trusted humans" });
  fireEvent.click(
    within(panel).getByRole("button", {
      name: /^(?:add|add a trusted human)$/i,
    }),
  );
  return panel;
}

describe("DogCardModal characterisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("on-demand dog resolution", () => {
    it("shows a loading state, renders the fetched dog, and seeds edit defaults from it", async () => {
      const fetchDogById = vi.fn(() => Promise.resolve({ ...baseDog }));
      renderModal({ dogs: {}, fetchDogById });

      expect(screen.getByText("Loading dog profile…")).toBeInTheDocument();
      expect(await screen.findByText("Bella")).toBeInTheDocument();
      expect(fetchDogById).toHaveBeenCalledWith("dog-1");

      // Edit defaults must re-seed from the fetched dog, not the placeholder.
      enterEdit();
      expect(screen.getByRole("textbox", { name: "Dog name" })).toHaveValue("Bella");
    });

    it("shows the not-found state when the fetch returns nothing", async () => {
      renderModal({ dogs: {}, fetchDogById: vi.fn(() => Promise.resolve(null)) });
      expect(await screen.findByText("Dog not found")).toBeInTheDocument();
    });
  });

  describe("edit-save field mapping", () => {
    it("maps every edited field to the update payload and omits unchanged identity fields", async () => {
      const onUpdateDog = vi.fn(() => Promise.resolve());
      renderModal({ onUpdateDog });
      enterEdit();

      fireEvent.change(screen.getByRole("combobox", { name: "Dog sex" }), { target: { value: "male" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Neutered" }), { target: { value: "yes" } });
      fireEvent.change(screen.getByPlaceholderText("Black & tan"), { target: { value: "Black & tan " } });
      fireEvent.change(screen.getByPlaceholderText("985..."), { target: { value: " 985000111222333 " } });
      fireEvent.change(screen.getByPlaceholderText("Vet practice"), { target: { value: " Vets4Pets Stockport " } });
      fireEvent.change(document.querySelector("textarea"), { target: { value: "Short on ears" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. 42"), { target: { value: "42" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Dog size" }), { target: { value: "large" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Birth month" }), { target: { value: "05" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Birth year" }), { target: { value: "2022" } });

      fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

      await waitFor(() => expect(onUpdateDog).toHaveBeenCalledTimes(1));
      const [idArg, updates] = onUpdateDog.mock.calls[0];
      expect(idArg).toBe("dog-1");
      // Exact payload: text trimmed, neutered → boolean, price → number,
      // dob composed as YYYY-MM with derived age. No name/breed/humanId
      // keys because those fields did not change.
      expect(updates).toEqual({
        groomNotes: "Short on ears",
        alerts: [],
        dob: "2022-05",
        age: expect.stringMatching(/^\d+ (yrs?|months?)$/),
        sex: "male",
        colour: "Black & tan",
        neutered: true,
        microchip: "985000111222333",
        vet: "Vets4Pets Stockport",
        customPrice: 42,
        size: "large",
      });

      expect(await screen.findByText("Dog profile saved")).toBeInTheDocument();
      // Edit mode exits after save.
      expect(screen.queryByRole("button", { name: /Save Changes/ })).not.toBeInTheDocument();
    });

    it("folds the allergy toggle + input into a single 'Allergic to' alert", async () => {
      const onUpdateDog = vi.fn(() => Promise.resolve());
      renderModal({ onUpdateDog });
      enterEdit();

      fireEvent.click(screen.getByRole("button", { name: "Allergy" }));
      fireEvent.change(screen.getByPlaceholderText("Allergic to..."), { target: { value: "chicken" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

      await waitFor(() => expect(onUpdateDog).toHaveBeenCalledTimes(1));
      expect(onUpdateDog.mock.calls[0][1].alerts).toEqual(["Allergic to chicken"]);
    });

    it("normalises cleared optional fields to null and a cleared price to null", async () => {
      const filledDog = {
        ...baseDog,
        sex: "female",
        colour: "Brown",
        neutered: false,
        microchip: "123",
        vet: "Old Vets",
        customPrice: 30,
      };
      const onUpdateDog = vi.fn(() => Promise.resolve());
      renderModal({ dogs: { Bella: filledDog }, onUpdateDog });
      enterEdit();

      fireEvent.change(screen.getByRole("combobox", { name: "Dog sex" }), { target: { value: "" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Neutered" }), { target: { value: "" } });
      fireEvent.change(screen.getByPlaceholderText("Black & tan"), { target: { value: "" } });
      fireEvent.change(screen.getByPlaceholderText("985..."), { target: { value: "" } });
      fireEvent.change(screen.getByPlaceholderText("Vet practice"), { target: { value: "" } });
      fireEvent.change(screen.getByPlaceholderText("e.g. 42"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));

      await waitFor(() => expect(onUpdateDog).toHaveBeenCalledTimes(1));
      const updates = onUpdateDog.mock.calls[0][1];
      expect(updates.sex).toBeNull();
      expect(updates.neutered).toBeNull();
      expect(updates.colour).toBeNull();
      expect(updates.microchip).toBeNull();
      expect(updates.vet).toBeNull();
      // A cleared price is sent as an explicit NULL so the DB custom_price
      // actually clears (the old undefined was silently dropped by
      // updateDog, making a custom price impossible to remove).
      expect(Object.hasOwn(updates, "customPrice")).toBe(true);
      expect(updates.customPrice).toBeNull();
    });

    it("cancel discards edits without saving and resets the form", () => {
      const onUpdateDog = vi.fn(() => Promise.resolve());
      renderModal({ onUpdateDog });
      enterEdit();

      fireEvent.change(screen.getByRole("textbox", { name: "Dog name" }), { target: { value: "Rex" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onUpdateDog).not.toHaveBeenCalled();
      expect(screen.getByText("Bella")).toBeInTheDocument();

      // Re-entering edit shows the original value, not the discarded one.
      enterEdit();
      expect(screen.getByRole("textbox", { name: "Dog name" })).toHaveValue("Bella");
    });

    it("auto-derives size from breed until staff override the size dropdown", () => {
      renderModal();
      enterEdit();

      const breedInput = screen.getByRole("combobox", { name: "Breed" });
      const sizeSelect = screen.getByRole("combobox", { name: "Dog size" });

      fireEvent.change(breedInput, { target: { value: "Labrador" } });
      expect(sizeSelect).toHaveValue("large");
      expect(screen.getByText("auto")).toBeInTheDocument();

      // Manual size choice wins from then on.
      fireEvent.change(sizeSelect, { target: { value: "medium" } });
      fireEvent.change(breedInput, { target: { value: "Chihuahua" } });
      expect(sizeSelect).toHaveValue("medium");
      expect(screen.queryByText("auto")).not.toBeInTheDocument();
    });
  });

  describe("owner search and linking", () => {
    it("searches the local humans map and saves the picked owner as humanId", async () => {
      const onUpdateDog = vi.fn(() => Promise.resolve());
      renderModal({ onUpdateDog });
      enterEdit();

      // The selector shows the currently linked owner.
      fireEvent.click(screen.getByText("Sarah Jones"));
      fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
        target: { value: "mark" },
      });
      fireEvent.click(screen.getByText("Mark Smith"));
      expect(screen.getByText("Mark Smith")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
      await waitFor(() => expect(onUpdateDog).toHaveBeenCalledTimes(1));
      expect(onUpdateDog.mock.calls[0][1].humanId).toBe("human-2");
    });

    it("shows the empty-state message when no human matches", () => {
      renderModal();
      enterEdit();

      fireEvent.click(screen.getByText("Sarah Jones"));
      fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
        target: { value: "zzz" },
      });
      expect(screen.getByText("No matching humans found")).toBeInTheDocument();
    });
  });

  describe("photo gallery", () => {
    it("mounts the gallery on demand and fetches photos for this dog", async () => {
      renderModal();

      expect(screen.queryByText("Bella's Photos")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "View groom photos" }));

      expect(await screen.findByText("Bella's Photos")).toBeInTheDocument();
      await waitFor(() =>
        expect(groomPhotoMocks.fetchPhotosForDog).toHaveBeenCalledWith("dog-1"),
      );
    });
  });

  describe("chain booking", () => {
    const bookings = {
      "2026-05-01": [
        { dog_id: "dog-1", booking_date: "2026-05-01", service: "full-groom", size: "small", slot: "09:00" },
      ],
      "2026-06-01": [
        { dog_id: "dog-1", booking_date: "2026-06-01", service: "full-groom", size: "small", slot: "10:00" },
      ],
    };

    it("hides the Recurring Bookings button when the dog has no bookings", () => {
      renderModal();
      expect(screen.queryByText("Recurring Bookings")).not.toBeInTheDocument();
    });

    it("opens the chain modal with the dog and its most recent booking", async () => {
      renderModal({ bookingsByDate: bookings });

      expect(screen.queryByTestId("chain-booking-modal")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Recurring Bookings" }));

      expect(await screen.findByTestId("chain-booking-modal")).toBeInTheDocument();
      expect(screen.getByTestId("chain-dog-name")).toHaveTextContent("Bella");
      expect(screen.getByTestId("chain-last-date")).toHaveTextContent("2026-06-01");
    });

    it("maps each chain link to a handleAdd call sharing one group_id", async () => {
      const handleAdd = vi.fn(() => Promise.resolve());
      renderModal({ bookingsByDate: bookings, handleAdd });

      fireEvent.click(screen.getByRole("button", { name: "Recurring Bookings" }));
      fireEvent.click(await screen.findByRole("button", { name: "stub-create-chain" }));

      await waitFor(() => expect(handleAdd).toHaveBeenCalledTimes(2));
      const [firstPayload, firstDate] = handleAdd.mock.calls[0];
      const [secondPayload, secondDate] = handleAdd.mock.calls[1];

      expect(firstDate).toBe("2026-07-01");
      expect(secondDate).toBe("2026-07-15");
      expect(firstPayload).toEqual({
        dogName: "Bella",
        dog_id: "dog-1",
        breed: "Cockapoo",
        size: "small",
        service: "full-groom",
        slot: "09:00",
        owner: "human-1",
        ownerName: "Sarah Jones",
        status: BOOKING_STATUS.BOOKED,
        group_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
      // The override flag only appears on the link that asked for it.
      expect(Object.hasOwn(firstPayload, "staff_capacity_override")).toBe(false);
      expect(secondPayload.staff_capacity_override).toBe(true);
      expect(secondPayload.group_id).toBe(firstPayload.group_id);
    });
  });

  describe("trusted humans", () => {
    it("offers trusted-human changes without putting the dog card into edit mode", () => {
      renderModal();

      expect(
        within(screen.getByRole("region", { name: "Trusted humans" }))
          .getByRole("button", { name: "Add" }),
      ).toBeInTheDocument();
    });

    it("debounces a server-side search alongside the local one", async () => {
      const searchHumansByTerm = vi.fn(() => Promise.resolve([]));
      renderModal({ searchHumansByTerm });
      enterEdit();

      openTrustedHumanPicker();
      fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
        target: { value: "Jo" },
      });

      await waitFor(() => expect(searchHumansByTerm).toHaveBeenCalledWith("Jo"));
    });

    it("links a search result from the owner to the trusted human only", async () => {
      const onUpdateHuman = vi.fn(() => Promise.resolve({ ok: true }));
      renderModal({ onUpdateHuman });
      enterEdit();

      openTrustedHumanPicker();
      fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
        target: { value: "mark" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Mark Smith/ }));

      expect(await screen.findByText("Trusted human linked")).toBeInTheDocument();
      expect(onUpdateHuman).toHaveBeenCalledTimes(1);
      expect(onUpdateHuman).toHaveBeenCalledWith("human-1", {
        trustedContacts: [{ id: "human-2", relationship: "" }],
      });
    });

    it("reuses an existing human by full name instead of creating a duplicate", async () => {
      const onAddHuman = vi.fn();
      const onUpdateHuman = vi.fn(() => Promise.resolve({ ok: true }));
      const findHumanByFullName = vi.fn(() => Promise.resolve(mark));
      renderModal({ onAddHuman, onUpdateHuman, findHumanByFullName });
      enterEdit();

      openTrustedHumanPicker();
      fireEvent.click(screen.getByRole("button", { name: "+ Create new human" }));
      fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Mark" } });
      fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Smith" } });
      fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "07700900222" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      await waitFor(() => expect(findHumanByFullName).toHaveBeenCalledWith("Mark", "Smith"));
      await screen.findByText("Linked existing Mark Smith as trusted human");
      expect(onAddHuman).not.toHaveBeenCalled();
      expect(onUpdateHuman).toHaveBeenCalledWith("human-1", {
        trustedContacts: [{ id: "human-2", relationship: "" }],
      });
    });

    it("surfaces an error toast when adding a new trusted human fails", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const onAddHuman = vi.fn(() => Promise.reject(new Error("boom")));
      renderModal({ onAddHuman });
      enterEdit();

      openTrustedHumanPicker();
      fireEvent.click(screen.getByRole("button", { name: "+ Create new human" }));
      fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "New" } });
      fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Person" } });
      fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "07700900333" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(await screen.findByText("boom")).toBeInTheDocument();
      consoleSpy.mockRestore();
    });

    it("removes the owner's one-way trusted relationship after the confirm dialog", async () => {
      const linkedSarah = {
        ...sarah,
        trustedContacts: [{ id: "human-2", relationship: "walker" }],
      };
      const linkedMark = {
        ...mark,
        trustedContacts: [{ id: "human-1", relationship: "" }],
      };
      const onUpdateHuman = vi.fn(() => Promise.resolve({ ok: true }));
      renderModal({
        humans: { "Sarah Jones": linkedSarah, "Mark Smith": linkedMark },
        onUpdateHuman,
      });
      enterEdit();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove Mark Smith as trusted human",
        }),
      );
      expect(await screen.findByText("Unlink trusted human?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));

      expect(await screen.findByText("Trusted human removed")).toBeInTheDocument();
      expect(onUpdateHuman).toHaveBeenCalledTimes(1);
      expect(onUpdateHuman).toHaveBeenCalledWith("human-1", { trustedContacts: [] });
    });
  });
});
