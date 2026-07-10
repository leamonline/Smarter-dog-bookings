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
    onOpenNewClient: vi.fn(),
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

// The flow now always asks "Send a booking confirmation?" after Confirm. Drive
// that dialog: open it, optionally pick a method (default is Auto), then confirm.
async function confirmWithMethod(method) {
  fireEvent.click(await screen.findByRole("button", { name: /confirm booking/i }));
  await screen.findByText(/send a booking confirmation/i);
  if (method) fireEvent.click(screen.getByRole("radio", { name: method }));
  // Two "Confirm booking" buttons now exist (modal + dialog); the dialog's
  // renders last in the DOM.
  const buttons = screen.getAllByRole("button", { name: /confirm booking/i });
  fireEvent.click(buttons[buttons.length - 1]);
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

  it("forwards to the New Client wizard when 'New customer' is clicked", () => {
    const props = renderModal();
    // "New customer" appears by the search field (and again in the no-results
    // panel); each hands off to the wizard. Clicking one is enough.
    const buttons = screen.getAllByRole("button", { name: "New customer" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(buttons[0]);
    expect(props.onOpenNewClient).toHaveBeenCalledTimes(1);
    // The parent owns closing the booking modal, not this component.
    expect(props.onClose).not.toHaveBeenCalled();
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

    await confirmWithMethod();

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/just filled up/i)).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes the wizard only after the save resolves ok", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    const props = renderModal({ initialEntries: [resumeEntry], onAdd });

    await confirmWithMethod();

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

    await confirmWithMethod();

    const again = await screen.findByRole("button", { name: /book another for emma/i });
    // The wizard still closes on success (truthful-save contract preserved);
    // the re-book offer rides on the toast.
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(again);
    expect(onBookAnother).toHaveBeenCalledWith("emma-id");
  });
});

// Confirmation method: staff are asked, after Confirm, whether to send a
// confirmation and how. The choice rides into each booking as
// confirmation_channel; the edge function reads it to suppress or force a method.
describe("NewBookingModal — confirmation method", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for a confirmation method after Confirm, before saving", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    renderModal({ initialEntries: [resumeEntry], onAdd });

    fireEvent.click(await screen.findByRole("button", { name: /confirm booking/i }));

    // The method dialog is shown and the save hasn't happened yet.
    expect(await screen.findByText(/send a booking confirmation/i)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("defaults to 'auto' when staff just confirm", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    renderModal({ initialEntries: [resumeEntry], onAdd });

    await confirmWithMethod();

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const bookings = onAdd.mock.calls[0][0];
    expect(bookings[0].confirmation_channel).toBe("auto");
  });

  it("stamps the chosen channel on the booking", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    renderModal({ initialEntries: [resumeEntry], onAdd });

    await confirmWithMethod(/whatsapp/i);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0][0].confirmation_channel).toBe("whatsapp");
  });

  it("carries 'none' through when staff choose not to send", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    renderModal({ initialEntries: [resumeEntry], onAdd });

    await confirmWithMethod(/don't send/i);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0][0].confirmation_channel).toBe("none");
  });
});

describe("live calendar link — draftPick", () => {
  const OPEN_DATE_2 = "2099-01-12";

  // The header subtitle is the one live-region that echoes the draft's
  // dog · slot · date. Assert on IT, not on bare text — the TimeSlotPicker
  // renders "9:00am"/"10:30am" as slot buttons too, which would false-pass.
  const getSubtitle = () =>
    Array.from(document.querySelectorAll('[aria-live="polite"]')).find((el) =>
      el.textContent.includes("Luna"),
    );

  const draftProps = () => ({
    onClose: vi.fn(),
    onAdd: vi.fn().mockResolvedValue({ ok: true }),
    dogs: {},
    humans: {},
    dogsByHumanId: {},
    ensureDogsForHumans: vi.fn(),
    bookingsByDate: {},
    dayOpenState: { [OPEN_DATE]: true, [OPEN_DATE_2]: true },
    daySettings: {},
    onOpenAddDog: vi.fn(),
    onOpenNewClient: vi.fn(),
    initialDateStr: OPEN_DATE,
    initialSlot: "09:00",
    initialEntries: [{ dog: luna, humanKey: "Emma Wilson", service: "full-groom", addons: [] }],
    onSearchDogs: vi.fn(),
    isSearchingDogs: false,
  });

  it("applies an incoming draftPick (date + slot) to the in-progress booking", async () => {
    const props = draftProps();
    const view = render(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={null} />
      </ToastProvider>,
    );
    // Seeded state shows in the live header subtitle once entries hydrate.
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/9:00am/));

    view.rerender(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={{ dateStr: OPEN_DATE_2, slot: "10:30", nonce: 1 }} />
      </ToastProvider>,
    );
    // New slot + new date land in the subtitle (Mon 12 Jan for 2099-01-12).
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/10:30am/));
    expect(getSubtitle()?.textContent).toMatch(/12 Jan/);
  });

  it("a date-only pick clears the chosen slot", async () => {
    const props = draftProps();
    const view = render(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={null} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/9:00am/));
    view.rerender(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={{ dateStr: OPEN_DATE_2, slot: "", nonce: 2 }} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getSubtitle()?.textContent).toMatch(/12 Jan/));
    expect(getSubtitle()?.textContent).not.toMatch(/9:00am/);
  });

  it("reports the draft's real target upward via onDraftTargetChange", async () => {
    const onDraftTargetChange = vi.fn();
    const props = { ...draftProps(), onDraftTargetChange };
    render(
      <ToastProvider>
        <NewBookingModal {...props} draftPick={null} />
      </ToastProvider>,
    );
    // Prefilled open (initialDateStr + initialSlot) reports immediately.
    await waitFor(() =>
      expect(onDraftTargetChange).toHaveBeenCalledWith({ dateStr: OPEN_DATE, slot: "09:00" }),
    );
  });
});
