// Cold-start booking-flow audit fixes A & C.
//
// Fix A (continuity): when staff step out of the wizard to create a new
// dog/human, the wizard now hands its in-progress draft up (captureDraft) and,
// on return, re-hydrates from `initialEntries` so the just-created dog is
// pre-selected — no re-search, no lost date/slot.
//
// Fix C (truthful toast): the modal awaits the real save and only reports
// success once `onAdd` resolves { ok: true }. A rejected save (e.g. a
// capacity/duplicate race after the client preflight) surfaces in-modal and
// keeps the wizard open instead of toasting a false success.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { NewBookingModal } from "./NewBookingModal.jsx";

// Avoid the trusted-contacts network fetch the owner effect would otherwise
// fire; an empty result skips the notify-recipient picker (the cold-start case).
vi.mock("../../supabase/hooks/humans/useTrustedContacts", () => ({
  fetchTrustedContactsForHuman: vi.fn().mockResolvedValue({ trustedContacts: [] }),
}));

const luna = {
  id: "dog-luna",
  name: "Luna",
  breed: "Poodle",
  size: "small",
  humanId: "Emma Wilson",
  _humanId: "emma-id",
  alerts: [],
};

// A far-future date keeps the past-date confirm dialog out of the way
// regardless of when the suite runs; it's "open" purely via dayOpenState.
const OPEN_DATE = "2099-01-05";

function renderModal(overrides = {}) {
  const props = {
    onClose: vi.fn(),
    onAdd: vi.fn().mockResolvedValue({ ok: true }),
    dogs: {},
    humans: {},
    dogsByHumanId: {},
    ensureDogsForHumans: vi.fn(),
    bookingsByDate: {},
    dayOpenState: { [OPEN_DATE]: true },
    daySettings: {},
    onOpenAddDog: vi.fn(),
    onOpenAddHuman: vi.fn(),
    initialDateStr: OPEN_DATE,
    initialSlot: "09:00",
    onSearchDogs: vi.fn(),
    isSearchingDogs: false,
    ...overrides,
  };
  render(
    <ToastProvider>
      <NewBookingModal {...props} />
    </ToastProvider>,
  );
  return props;
}

const resumeEntry = {
  dog: luna,
  humanKey: "Emma Wilson",
  service: "full-groom",
  addons: [],
};

describe("NewBookingModal — cold-start continuity (Fix A)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hydrates a pre-selected dog from initialEntries instead of a fresh search", async () => {
    renderModal({ initialEntries: [resumeEntry] });
    // The just-created dog is selected straight away…
    expect(await screen.findByText("Luna")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /service for luna/i }),
    ).toBeInTheDocument();
    // …so the dog-search input is no longer shown.
    expect(
      screen.queryByPlaceholderText(/start typing a dog's name/i),
    ).not.toBeInTheDocument();
  });

  it("hands the in-progress draft (date + slot) up when '+ New Dog' is clicked", () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "+ New Dog" }));
    expect(props.onOpenAddDog).toHaveBeenCalledTimes(1);
    expect(props.onOpenAddDog).toHaveBeenCalledWith(
      expect.objectContaining({
        dateStr: OPEN_DATE,
        slot: "09:00",
        entries: [],
        owner: null,
      }),
    );
    // It must NOT close the wizard itself — the parent parks the booking.
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("carries the known owner into the draft when '+ New Dog' is clicked before a dog is picked", async () => {
    // Cold-start gap: staff have created the customer (so initialHumanId is
    // known) but no dog is selected yet. The captured draft must still carry
    // that owner so AddDogModal opens owner-locked — no re-search of the
    // customer they just made.
    const owner = { id: "emma-id", fullName: "Emma Wilson", phone: "+447700900111" };
    const props = renderModal({
      initialHumanId: "emma-id",
      humans: { "emma-id": owner },
    });

    fireEvent.click(await screen.findByRole("button", { name: "+ New Dog" }));

    expect(props.onOpenAddDog).toHaveBeenCalledTimes(1);
    expect(props.onOpenAddDog).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [],
        owner: expect.objectContaining({ id: "emma-id", label: "Emma Wilson" }),
      }),
    );
  });
});

describe("NewBookingModal — truthful save (Fix C)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the wizard open and shows the error when the save is rejected", async () => {
    const onAdd = vi.fn().mockResolvedValue({
      ok: false,
      error: "That slot just filled up — please pick another time.",
    });
    const props = renderModal({ initialEntries: [resumeEntry], onAdd });

    fireEvent.click(await screen.findByRole("button", { name: /confirm booking/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/just filled up/i)).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes the wizard only after the save resolves ok", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    const props = renderModal({ initialEntries: [resumeEntry], onAdd });

    fireEvent.click(await screen.findByRole("button", { name: /confirm booking/i }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

// Book another for owner (audit friction C-2): the second booking (e.g. a 4th
// dog on a different date for the same new customer) used to start cold — the
// wizard closed and the owner had to be found again. The success toast now
// offers "Book another for {owner}", which re-opens a fresh booking pre-filled
// with that owner.
describe("NewBookingModal — book another for owner (C-2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers 'Book another for {owner}' after a successful save", async () => {
    const onBookAnother = vi.fn();
    const props = renderModal({
      initialEntries: [resumeEntry],
      humans: { "emma-id": { id: "emma-id", name: "Emma", fullName: "Emma Wilson" } },
      onBookAnother,
      onAdd: vi.fn().mockResolvedValue({ ok: true }),
    });

    fireEvent.click(await screen.findByRole("button", { name: /confirm booking/i }));

    const again = await screen.findByRole("button", { name: /book another for emma/i });
    // The wizard still closes on success (truthful-save contract preserved);
    // the re-book offer rides on the toast.
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(again);
    expect(onBookAnother).toHaveBeenCalledWith("emma-id");
  });
});
