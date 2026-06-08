// Flow test for MergeHumanDialog: search -> pick a duplicate -> review the
// side-by-side comparison -> confirm -> the merge handler is called with the
// (winner, loser) ids in the right order, including after a swap.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const { MergeHumanDialog } = await import("./MergeHumanDialog.jsx");

const current = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900111",
};
const duplicate = {
  id: "human-2",
  fullName: "Sara Jones",
  name: "Sara",
  surname: "Jones",
  phone: "07700 900222",
};

function renderDialog(overrides = {}) {
  const onMerge = vi.fn(() => Promise.resolve({ ok: true }));
  const props = {
    human: current,
    humans: { "Sarah Jones": current, "Sara Jones": duplicate },
    dogs: {},
    dogsByHumanId: {},
    bookingsByDate: {},
    ensureDogsForHumans: vi.fn(),
    searchHumansByTerm: vi.fn(() => Promise.resolve([])),
    onMerge,
    onMerged: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <MergeHumanDialog {...props} />
    </ToastProvider>,
  );
  return { ...result, props, onMerge };
}

function pickDuplicateAndOpenConfirm() {
  fireEvent.change(screen.getByLabelText("Search for a duplicate human"), {
    target: { value: "sara" },
  });
  // Only the other record is offered (self is filtered out).
  fireEvent.click(screen.getByRole("button", { name: /Sara Jones/ }));
  fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
}

describe("MergeHumanDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges the searched record into the current one by default", async () => {
    const { onMerge } = renderDialog();
    pickDuplicateAndOpenConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Merge and delete" }));
    expect(onMerge).toHaveBeenCalledWith("human-1", "human-2");
  });

  it("swapping which record to keep flips the winner and loser", async () => {
    const { onMerge } = renderDialog();
    fireEvent.change(screen.getByLabelText("Search for a duplicate human"), {
      target: { value: "sara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Sara Jones/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Swap which record to keep" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge…" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge and delete" }));
    expect(onMerge).toHaveBeenCalledWith("human-2", "human-1");
  });

  it("does not call the merge handler until the confirm dialog is accepted", () => {
    const { onMerge } = renderDialog();
    pickDuplicateAndOpenConfirm();
    expect(onMerge).not.toHaveBeenCalled();
  });
});
