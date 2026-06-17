// Regression test for the "create new trusted human" duplicate guard.
// The humans directory no longer enforces a unique (name, surname), so this
// flow must look an existing customer up and link them rather than blindly
// inserting a second record. (DogCardModal.handleAddNewTrusted uses the same
// pattern.)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TrustedHumansPanel } from "./TrustedHumansPanel.jsx";

const owner = {
  id: "owner-1",
  fullName: "Alice Owner",
  name: "Alice",
  surname: "Owner",
  trustedContacts: [],
};

function renderPanel(overrides = {}) {
  const onAddHuman = vi.fn().mockResolvedValue({ id: "new-1", fullName: "Sarah Jones" });
  const onUpdateHuman = vi.fn().mockResolvedValue(undefined);
  const findHumanByFullName = vi.fn().mockResolvedValue(null);
  const props = {
    human: owner,
    humanFullName: owner.fullName,
    humans: {},
    onClose: vi.fn(),
    onOpenHuman: vi.fn(),
    onUpdateHuman,
    onAddHuman,
    findHumanByFullName,
    searchHumansByTerm: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <TrustedHumansPanel {...props} />
    </ToastProvider>,
  );
  return { ...result, onAddHuman, onUpdateHuman, findHumanByFullName, props };
}

// Walk the UI to the filled-in "New trusted human" form, ready to submit.
function openAndFillNewTrustedForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add" })); // reveal the add panel
  fireEvent.click(screen.getByRole("button", { name: /create new human/i }));
  fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Sarah" } });
  fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Jones" } });
  fireEvent.change(screen.getByPlaceholderText("Phone number"), {
    target: { value: "07700900111" },
  });
}

describe("TrustedHumansPanel — duplicate guard on 'create new trusted human'", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("links an existing same-named customer instead of creating a duplicate", async () => {
    const existing = {
      id: "existing-1",
      fullName: "Sarah Jones",
      name: "Sarah",
      surname: "Jones",
      trustedContacts: [],
    };
    const findHumanByFullName = vi.fn().mockResolvedValue(existing);
    const { onAddHuman, onUpdateHuman } = renderPanel({ findHumanByFullName });

    openAndFillNewTrustedForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" })); // submit the new-trusted form

    await waitFor(() => expect(onUpdateHuman).toHaveBeenCalled());
    expect(findHumanByFullName).toHaveBeenCalledWith("Sarah", "Jones");
    // No new record is created — the existing customer is linked instead.
    expect(onAddHuman).not.toHaveBeenCalled();
    expect(onUpdateHuman).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        trustedContacts: expect.arrayContaining([
          expect.objectContaining({ id: "existing-1" }),
        ]),
      }),
    );
  });

  it("creates a new customer when no existing match is found", async () => {
    const findHumanByFullName = vi.fn().mockResolvedValue(null);
    const { onAddHuman } = renderPanel({ findHumanByFullName });

    openAndFillNewTrustedForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onAddHuman).toHaveBeenCalledTimes(1));
    expect(onAddHuman).toHaveBeenCalledWith(
      // The typed national number is normalised to E.164 before it's stored.
      expect.objectContaining({ name: "Sarah", surname: "Jones", phone: "+447700900111" }),
    );
  });
});
