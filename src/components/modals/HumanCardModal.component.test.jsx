// Smoke-level tests for HumanCardModal. The component is 972 LoC with
// 21+ useState; this test locks the entry-point behaviour ahead of
// the planned extraction (HumanForm / HumanBookingHistorySection /
// TrustedContactsEditor / DogPillList).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const { HumanCardModal } = await import("./HumanCardModal.jsx");

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
});
