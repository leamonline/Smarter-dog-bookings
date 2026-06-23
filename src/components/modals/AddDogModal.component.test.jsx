// Batch dog creation (audit friction C-4). In the staff cold-start flow, adding
// several dogs for one new customer meant a full park -> AddDogModal -> resume
// round-trip per dog. AddDogModal now offers "Save & add another" (only when the
// booking flow passes `onAddAnother`): it persists the dog, keeps the modal open
// with the dog fields reset, and LOCKS the owner so the next dog skips owner
// entry. The primary "Add Dog" still finishes and closes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { AddDogModal } from "./AddDogModal.jsx";

const NEW_DOG = { id: "dog-bella", name: "Bella", _humanId: "emma-id", humanId: "Emma Wilson" };

function renderAddDog(overrides = {}) {
  const props = {
    onClose: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(NEW_DOG),
    onAddAnother: vi.fn().mockResolvedValue(NEW_DOG),
    onAddHuman: vi.fn().mockResolvedValue({ id: "emma-id" }),
    humans: {},
    presetOwner: null,
    ...overrides,
  };
  render(
    <ToastProvider>
      <AddDogModal {...props} />
    </ToastProvider>,
  );
  return props;
}

// Fill the required dog fields via the "Other" breed route so the test doesn't
// depend on the breed list; size is set manually.
function fillDog(name) {
  fireEvent.change(screen.getByLabelText(/dog name/i), { target: { value: name } });
  fireEvent.change(document.getElementById("add-dog-breed"), { target: { value: "__other__" } });
  fireEvent.change(screen.getByLabelText(/custom breed/i), { target: { value: "Mixed" } });
  fireEvent.change(document.getElementById("add-dog-size"), { target: { value: "small" } });
}

function fillInlineOwner() {
  fireEvent.click(screen.getByRole("button", { name: /add new owner/i }));
  fireEvent.change(screen.getByLabelText(/owner first name/i), { target: { value: "Emma" } });
  fireEvent.change(screen.getByLabelText(/owner surname/i), { target: { value: "Wilson" } });
  fireEvent.change(screen.getByLabelText(/owner phone number/i), { target: { value: "07700900111" } });
}

describe("AddDogModal — batch add (C-4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not offer 'Save & add another' outside the booking flow", () => {
    renderAddDog({ onAddAnother: undefined, presetOwner: { id: "x", label: "Someone", phone: "" } });
    expect(
      screen.queryByRole("button", { name: /save & add another/i }),
    ).not.toBeInTheDocument();
  });

  it("'Save & add another' persists the dog, stays open with fields reset, and locks the owner", async () => {
    const props = renderAddDog();
    fillDog("Bella");
    fillInlineOwner();

    fireEvent.click(screen.getByRole("button", { name: /save & add another/i }));

    // Created via the non-closing path (inline owner first), wizard not torn down.
    await waitFor(() => expect(props.onAddAnother).toHaveBeenCalledTimes(1));
    expect(props.onAddHuman).toHaveBeenCalledTimes(1);
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    // Ready for the next dog: dog fields cleared…
    await waitFor(() => expect(screen.getByLabelText(/dog name/i)).toHaveValue(""));
    // …owner locked to the just-used customer (no search, no "add new owner").
    expect(screen.getByText("Emma Wilson")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search by name or phone/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add new owner/i })).not.toBeInTheDocument();
  });

  it("primary 'Add Dog' still finishes and closes the modal", async () => {
    const props = renderAddDog({ presetOwner: { id: "emma-id", label: "Emma Wilson", phone: "" } });
    fillDog("Bella");

    fireEvent.click(screen.getByRole("button", { name: /^add dog$/i }));

    await waitFor(() => expect(props.onAdd).toHaveBeenCalledTimes(1));
    expect(props.onAddAnother).not.toHaveBeenCalled();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });
});
