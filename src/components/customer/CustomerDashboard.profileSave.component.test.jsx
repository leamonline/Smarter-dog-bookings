import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useCustomerDashboardData: vi.fn(),
  saveContactDetails: vi.fn(),
  lookupAddress: vi.fn(),
  restoredDraft: { value: null },
}));

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../../supabase/hooks/useCustomerDashboardData", () => ({
  useCustomerDashboardData: mocks.useCustomerDashboardData,
}));

vi.mock("../../supabase/hooks/useCustomerOnboardingActions", () => ({
  useCustomerOnboardingActions: () => ({ lookupAddress: mocks.lookupAddress }),
}));

vi.mock("../../hooks/useDraftPersistence", () => ({
  useDraftPersistence: () => ({ restored: mocks.restoredDraft.value, save: vi.fn(), clear: vi.fn() }),
}));

vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => <span>Calendar action</span>,
}));

import { CustomerDashboard } from "./CustomerDashboard.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

/**
 * My details used to save the address from a free-text box while resending
 * the postcode the page was opened with, and Cancel always went back to that
 * opening record — so after one save, cancelling a second edit put the old
 * details back on screen. The card now edits the address through the same
 * picker as sign-up (address and postcode together) and treats the row the
 * server saved as the new starting point.
 */

const HUMAN = {
  id: "41000000-0000-4000-8000-000000000001",
  name: "Sam",
  surname: "Jones",
  address: "1 Old Road, Hyde, SK14 1AA",
  postcode: "SK14 1AA",
  email: "sam@example.com",
  whatsapp: false,
  phone: "+447700900123",
};

function savedRow(overrides = {}) {
  return {
    id: HUMAN.id,
    name: HUMAN.name,
    surname: HUMAN.surname,
    address: HUMAN.address,
    postcode: HUMAN.postcode,
    email: HUMAN.email,
    whatsapp: false,
    fb: null,
    insta: null,
    tiktok: null,
    ...overrides,
  };
}

function renderDashboard() {
  mocks.useCustomerDashboardData.mockReturnValue({
    dogs: [],
    bookings: [],
    olderBookings: [],
    trustedHumans: [],
    loading: false,
    retrying: false,
    loadError: null,
    trustedHumansError: null,
    loaded: { dogs: true, bookings: true, trustedHumans: true },
    hasMorePast: false,
    loadingMore: false,
    loadMore: vi.fn(),
    refreshBookings: vi.fn(),
    retryLoad: vi.fn(),
    retryTrustedHumans: vi.fn(),
    saveContactDetails: mocks.saveContactDetails,
    updateDog: vi.fn(),
    addDog: vi.fn(),
  });
  render(
    <MemoryRouter>
      <ToastProvider>
        <CustomerDashboard humanRecord={HUMAN} onSignOut={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function card() {
  return within(screen.getByRole("heading", { name: "My details" }).closest(".portal-card"));
}

async function save(row) {
  mocks.saveContactDetails.mockResolvedValueOnce({ error: null, saved: true, profile: row });
  await act(async () => {
    fireEvent.click(card().getByRole("button", { name: "Save" }));
  });
}

function rename(first) {
  fireEvent.change(card().getByLabelText("First name"), { target: { value: first } });
}

async function enterAddressByHand(address, postcode) {
  fireEvent.click(card().getByRole("button", { name: "Update address" }));
  fireEvent.click(card().getByRole("button", { name: /enter it manually/i }));
  fireEvent.change(card().getByLabelText("Full address"), { target: { value: address } });
  fireEvent.change(card().getByLabelText("Postcode"), { target: { value: postcode } });
}

describe("CustomerDashboard — saving My details", () => {
  beforeEach(() => {
    mocks.saveContactDetails.mockReset();
    mocks.lookupAddress.mockReset();
    mocks.restoredDraft.value = null;
  });

  it("keeps a postcode-only correction from a restored draft", async () => {
    // Same address text, corrected postcode, page left before saving. The
    // picker must reopen on the draft, or it reports the saved postcode and
    // silently undoes the correction. (Codex review on #1076.)
    mocks.restoredDraft.value = {
      name: HUMAN.name,
      surname: HUMAN.surname,
      address: HUMAN.address,
      postcode: "SK14 9ZZ",
      email: HUMAN.email,
      whatsapp: false,
      fb: "",
      insta: "",
      tiktok: "",
    };
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));

    await save(savedRow({ postcode: "SK14 9ZZ" }));

    expect(mocks.saveContactDetails).toHaveBeenCalledWith(
      expect.objectContaining({ address: HUMAN.address, postcode: "SK14 9ZZ" }),
    );
  });

  it("keeps the saved address and its postcode when only the name changes", async () => {
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    rename("Samantha");

    await save(savedRow({ name: "Samantha" }));

    expect(mocks.saveContactDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Samantha",
        address: HUMAN.address,
        postcode: "SK14 1AA",
      }),
    );
  });

  it("cancels back to what was last saved, not to the details the page opened with", async () => {
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    rename("Samantha");
    await save(savedRow({ name: "Samantha" }));

    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    rename("Zed");
    fireEvent.click(card().getByRole("button", { name: /cancel/i }));

    expect(card().getByText("Samantha Jones")).toBeInTheDocument();
    expect(card().queryByText("Sam Jones")).not.toBeInTheDocument();
  });

  it("saves a new address together with its own postcode", async () => {
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    await enterAddressByHand("2 New Street, Hyde", "sk14 2ab");

    await save(savedRow({ address: "2 New Street, Hyde", postcode: "SK14 2AB" }));

    expect(mocks.saveContactDetails).toHaveBeenCalledWith(
      expect.objectContaining({ address: "2 New Street, Hyde", postcode: "SK14 2AB" }),
    );
    expect(card().getByText("2 New Street, Hyde")).toBeInTheDocument();
  });

  it("keeps the newly saved postcode on the next save instead of the old one", async () => {
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    await enterAddressByHand("2 New Street, Hyde", "SK14 2AB");
    await save(savedRow({ address: "2 New Street, Hyde", postcode: "SK14 2AB" }));

    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    rename("Samantha");
    await save(savedRow({ name: "Samantha", address: "2 New Street, Hyde", postcode: "SK14 2AB" }));

    expect(mocks.saveContactDetails).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: "2 New Street, Hyde", postcode: "SK14 2AB" }),
    );
  });

  it("gives the address picker the full row width while editing", () => {
    // Beside its label, the picker's search box was squeezed to a sliver on
    // a phone by the Find address button. While editing, the address editor
    // drops below the label instead; the other rows keep label-and-value.
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));

    const addressRow = card().getByText("Address").closest(".portal-detail-row");
    const emailRow = card().getByText("Email").closest(".portal-detail-row");
    expect(addressRow).toHaveClass("portal-detail-row--stacked");
    expect(emailRow).not.toHaveClass("portal-detail-row--stacked");
  });

  it("will not save while an address search is left unfinished", async () => {
    renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.click(card().getByRole("button", { name: "Update address" }));

    await act(async () => {
      fireEvent.click(card().getByRole("button", { name: "Save" }));
    });

    expect(mocks.saveContactDetails).not.toHaveBeenCalled();
    expect(card().getByRole("alert")).toHaveTextContent(/choose your address/i);
  });
});
