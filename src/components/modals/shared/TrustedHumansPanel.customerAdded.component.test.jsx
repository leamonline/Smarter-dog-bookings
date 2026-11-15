// Staff see the trusted humans a customer added in the portal, marked as such,
// on every surface that shows the shared panel (dog card, booking, customer).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const mocks = vi.hoisted(() => ({
  contacts: [],
  status: "loaded",
  retry: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../../supabase/hooks/useCustomerAddedContacts", () => ({
  useCustomerAddedContacts: () => ({
    contacts: mocks.contacts,
    status: mocks.status,
    retry: mocks.retry,
    remove: mocks.remove,
  }),
}));

import { TrustedHumansPanel } from "./TrustedHumansPanel.jsx";

const owner = { id: "owner-1", fullName: "Alice Owner", name: "Alice", surname: "Owner", trustedContacts: [] };

function renderPanel() {
  return render(
    <ToastProvider>
      <TrustedHumansPanel
        human={owner}
        humans={{}}
        onClose={vi.fn()}
        onOpenHuman={vi.fn()}
        onUpdateHuman={vi.fn().mockResolvedValue({ id: "saved" })}
        onAddHuman={vi.fn()}
        findHumanByFullName={vi.fn()}
        searchHumansByTerm={vi.fn().mockResolvedValue([])}
      />
    </ToastProvider>,
  );
}

describe("TrustedHumansPanel — customer-added contacts", () => {
  beforeEach(() => {
    mocks.status = "loaded";
    mocks.retry.mockReset();
  });

  it("shows each one with its relationship and phone, marked as added by the customer", () => {
    mocks.contacts = [{ id: "cc-1", name: "gran", surname: "smith", phone: "+447700900124", relationship: "Mum" }];
    renderPanel();
    const list = screen.getByLabelText("Added by the customer");
    expect(within(list).getByText("Gran Smith")).toBeInTheDocument();
    expect(within(list).getByText("Added by customer")).toBeInTheDocument();
    expect(within(list).getByText("Mum · +447700900124")).toBeInTheDocument();
    // The staff-linked list is empty, and says so without contradicting it.
    expect(screen.getByText("None added by staff")).toBeInTheDocument();
    expect(screen.queryByText("No trusted humans")).not.toBeInTheDocument();
  });

  it("lets staff remove one after confirming", async () => {
    mocks.contacts = [{ id: "cc-1", name: "Gran", surname: null, phone: "+447700900124", relationship: null }];
    mocks.remove.mockReset().mockResolvedValue(true);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Remove Gran as trusted human" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("cc-1"));
  });

  it("shows nothing extra when the customer has added nobody", () => {
    mocks.contacts = [];
    renderPanel();
    expect(screen.queryByLabelText("Added by the customer")).not.toBeInTheDocument();
    expect(screen.getByText("No trusted humans")).toBeInTheDocument();
  });

  // Staff decide who may collect a dog from this panel: a failed or pending
  // read must never be shown as "nobody is trusted".
  it("says the customer-added list could not load, offers a retry, and claims nothing", () => {
    mocks.contacts = [];
    mocks.status = "error";
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the trusted humans this customer added.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No trusted humans")).not.toBeInTheDocument();
    expect(screen.getByText("None added by staff")).toBeInTheDocument();
  });

  it("does not claim nobody is trusted while the customer-added list is loading", () => {
    mocks.contacts = [];
    mocks.status = "loading";
    renderPanel();
    expect(screen.queryByText("No trusted humans")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
