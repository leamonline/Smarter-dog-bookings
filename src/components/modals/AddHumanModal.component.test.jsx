// Tests for the AddHumanModal soft duplicate guard. The DB no longer enforces
// a unique (name, surname), so the form must surface an existing same-named
// customer before creating a second record — without hard-blocking, since two
// real people can share a name.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { AddHumanModal } from "./AddHumanModal.jsx";

const existingHuman = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700900111",
};

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const onAdd = vi.fn().mockResolvedValue({ id: "new-1" });
  const findHumanByFullName = vi.fn().mockResolvedValue(null);
  const props = { onClose, onAdd, humans: {}, findHumanByFullName, ...overrides };
  const result = render(
    <ToastProvider>
      <AddHumanModal {...props} />
    </ToastProvider>,
  );
  return { ...result, onClose, onAdd, findHumanByFullName, props };
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText("Sarah"), { target: { value: "Sarah" } });
  fireEvent.change(screen.getByPlaceholderText("Jones"), { target: { value: "Jones" } });
  fireEvent.change(screen.getByPlaceholderText("07700 900111"), {
    target: { value: "07700900111" },
  });
}

describe("AddHumanModal duplicate guard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("adds directly when no existing customer shares the name", async () => {
    const { onAdd, findHumanByFullName } = renderModal();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add Human" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(findHumanByFullName).toHaveBeenCalledWith("Sarah", "Jones");
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sarah", surname: "Jones" }),
    );
  });

  it("warns instead of adding when a same-named customer already exists", async () => {
    const findHumanByFullName = vi.fn().mockResolvedValue(existingHuman);
    const { onAdd } = renderModal({ findHumanByFullName });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add Human" }));

    // Warning is surfaced and nothing is created yet.
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    // The action flips to an explicit "Add anyway" confirmation.
    expect(screen.getByRole("button", { name: "Add anyway" })).toBeInTheDocument();
  });

  it("adds anyway on the second submit after the warning", async () => {
    const findHumanByFullName = vi.fn().mockResolvedValue(existingHuman);
    const { onAdd } = renderModal({ findHumanByFullName });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add Human" }));

    const addAnyway = await screen.findByRole("button", { name: "Add anyway" });
    fireEvent.click(addAnyway);

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    // The duplicate lookup isn't repeated on the confirming submit.
    expect(findHumanByFullName).toHaveBeenCalledTimes(1);
  });

  it("clears the warning when the name is edited", async () => {
    const findHumanByFullName = vi.fn().mockResolvedValue(existingHuman);
    renderModal({ findHumanByFullName });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add Human" }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Sarah"), { target: { value: "Sarahh" } });
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Human" })).toBeInTheDocument();
  });
});
