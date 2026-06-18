// Smoke-level tests for HumanCardModal. The component is 972 LoC with
// 21+ useState; this test locks the entry-point behaviour ahead of
// the planned extraction (HumanForm / HumanBookingHistorySection /
// TrustedContactsEditor / DogPillList).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BOOKING_STATUS } from "../../constants/index";

const { HumanCardModal } = await import("./HumanCardModal.jsx");

// A completed booking owned by human-1, dated well in the past so it always
// counts as a "last visit" regardless of when the suite runs.
const pastBooking = {
  id: "booking-1",
  _ownerId: "human-1",
  _dogId: "dog-1",
  dogName: "Rex",
  owner: "Sarah Jones",
  service: "full-groom",
  status: BOOKING_STATUS.COMPLETED,
  size: "small",
};
const bookingsWithHistory = { "2020-01-01": [pastBooking] };

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900111",
  sms: true,
  whatsapp: true,
  email: "sarah@example.com",
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

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const props = {
    humanId: "human-1",
    onClose,
    onOpenHuman: vi.fn(),
    onOpenDog: vi.fn(),
    humans: { "Sarah Jones": human },
    dogs: {},
    onUpdateHuman: vi.fn(),
    onAddHuman: vi.fn(),
    onDeleteHuman: vi.fn(),
    bookingsByDate: {},
    fetchHumanById: vi.fn(() => Promise.resolve(null)),
    findHumanByFullName: vi.fn(() => null),
    searchHumansByTerm: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <HumanCardModal {...props} />
    </ToastProvider>,
  );
  return { ...result, onClose, props };
}

describe("HumanCardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the full name and phone number in the header", () => {
    renderModal();
    expect(screen.getByText("Sarah Jones")).toBeInTheDocument();
    // Phone is rendered both as the visible link text and in the
    // copy-to-clipboard aria label.
    expect(
      screen.getByRole("link", { name: "07700 900111" }),
    ).toBeInTheDocument();
  });

  it("Close button fires onClose", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("entering edit mode reveals first-name + surname inputs prefilled with the current values", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByPlaceholderText("First name")).toHaveValue("Sarah");
    expect(screen.getByPlaceholderText("Surname")).toHaveValue("Jones");
  });

  it("copy-phone button calls navigator.clipboard.writeText with the phone number", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy phone number 07700 900111" }),
    );
    expect(writeText).toHaveBeenCalledWith("07700 900111");
  });

  it("clicking a booking-history row calls onOpenBooking with the booking id", () => {
    const onOpenBooking = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onOpenBooking });
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking on 2020-01-01 for Rex" }),
    );
    expect(onOpenBooking).toHaveBeenCalledWith("booking-1");
  });

  it("the Last visit tile opens the most recent booking via onOpenBooking", () => {
    const onOpenBooking = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onOpenBooking });
    fireEvent.click(screen.getByRole("button", { name: "Open most recent visit" }));
    expect(onOpenBooking).toHaveBeenCalledWith("booking-1");
  });

  it("the Bookings tile scrolls the history section into view", () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderModal({ bookingsByDate: bookingsWithHistory });
    fireEvent.click(
      screen.getByRole("button", { name: "See all bookings (1 lifetime)" }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("the Send message overflow item calls onSendMessage with the human id", () => {
    const onSendMessage = vi.fn();
    renderModal({ onSendMessage });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send message" }));
    expect(onSendMessage).toHaveBeenCalledWith("human-1");
  });

  it("shows a Book now affordance when there's no next appointment", () => {
    const onNewBookingForHuman = vi.fn();
    renderModal({ onNewBookingForHuman });
    fireEvent.click(
      screen.getByRole("button", { name: "Book a new appointment for this human" }),
    );
    expect(onNewBookingForHuman).toHaveBeenCalledWith("human-1");
  });

  it("the Notes empty state offers Add a note and jumps into edit mode", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    // Edit mode is now active with the notes textarea available to type into.
    expect(screen.getByLabelText("General notes")).toBeInTheDocument();
  });

  it("header shows call + WhatsApp actions, WhatsApp only when whatsapp is on", () => {
    renderModal();
    expect(
      screen.getByRole("link", { name: "Call 07700 900111" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Message 07700 900111 on WhatsApp" }),
    ).toBeInTheDocument();
  });

  it("hides the WhatsApp action when whatsapp is off but keeps the call action", () => {
    renderModal({
      humans: { "Sarah Jones": { ...human, whatsapp: false } },
    });
    expect(
      screen.queryByRole("link", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Call 07700 900111" }),
    ).toBeInTheDocument();
  });

  it("contact-row copy buttons copy the value to the clipboard", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    renderModal({
      humans: {
        "Sarah Jones": { ...human, address: "1 Dog Lane", email: "sarah@example.com" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(writeText).toHaveBeenCalledWith("1 Dog Lane");
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith("sarah@example.com");
  });

  it("Book again on a history row calls onBookAgain with that booking", () => {
    const onBookAgain = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onBookAgain });
    fireEvent.click(screen.getByRole("button", { name: "Book Rex again" }));
    expect(onBookAgain).toHaveBeenCalledTimes(1);
    expect(onBookAgain.mock.calls[0][0]).toMatchObject({
      _dogId: "dog-1",
      service: "full-groom",
    });
  });

  it("Archive asks for confirmation before calling onArchiveHuman", () => {
    const onArchiveHuman = vi.fn(() => Promise.resolve({ id: "human-1" }));
    renderModal({ onArchiveHuman });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    // Confirm dialog is shown; the handler hasn't fired yet.
    expect(screen.getByText("Archive this person?")).toBeInTheDocument();
    expect(onArchiveHuman).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchiveHuman).toHaveBeenCalledWith("human-1");
  });

  // Regression: deep-linking / refreshing straight to /humans/<uuid> for a
  // human whose row sits past the directory's PAGE_SIZE boundary used to leave
  // the card stuck on "Unnamed human / No phone". The map never holds that row
  // at first paint, and the modal threw away fetchHumanById's return value —
  // it relied on the shared map eventually catching up, which on a quiet boot
  // never re-triggered. The card must now hydrate from the fetched row itself,
  // exactly as clicking the same person from the directory does.
  describe("deep-link hydration", () => {
    const deepLinked = {
      ...human,
      id: "human-far-page",
      fullName: "Hazel Wagschal",
      name: "Hazel",
      surname: "Wagschal",
      phone: "07826 094636",
    };

    it("hydrates from fetchHumanById when the human isn't in the humans map", async () => {
      const fetchHumanById = vi.fn(() => Promise.resolve(deepLinked));
      renderModal({
        humanId: "human-far-page",
        humans: {}, // past the paginated window — not in the shared map
        fetchHumanById,
      });

      // First paint: nothing to resolve yet, so the placeholder shows.
      expect(screen.getByText("Unnamed human")).toBeInTheDocument();

      // Once the on-demand fetch lands the card hydrates from the returned
      // row, even though the shared humans map was never updated.
      expect(await screen.findByText("Hazel Wagschal")).toBeInTheDocument();
      expect(fetchHumanById).toHaveBeenCalledWith("human-far-page");
      expect(
        screen.getByRole("link", { name: "07826 094636" }),
      ).toBeInTheDocument();
    });

    it("prefers the live map entry over an on-demand fetch when present", async () => {
      const fetchHumanById = vi.fn(() => Promise.resolve(deepLinked));
      // The same id is already in the map (e.g. opened from the directory):
      // the card resolves it synchronously and never needs the fetch.
      renderModal({
        humanId: "human-far-page",
        humans: { "Hazel Wagschal": deepLinked },
        fetchHumanById,
      });

      expect(screen.getByText("Hazel Wagschal")).toBeInTheDocument();
      await waitFor(() => expect(fetchHumanById).not.toHaveBeenCalled());
    });
  });
});
