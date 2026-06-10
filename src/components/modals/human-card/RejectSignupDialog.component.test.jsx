// Focused tests for the reject-signup confirm, extracted from
// HumanCardModal (Debt #7). The reason contract matters downstream: a
// blank textarea must reach onRejectSignup as null (not ""), and a typed
// reason arrives trimmed for the history flag.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RejectSignupDialog } from "./RejectSignupDialog.jsx";

function renderDialog(overrides = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const props = { busy: false, onCancel, onConfirm, ...overrides };
  const result = render(<RejectSignupDialog {...props} />);
  return { ...result, onCancel, onConfirm };
}

describe("RejectSignupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms with null when the reason is blank or whitespace", () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(
      screen.getByLabelText("Rejection reason (optional)"),
      { target: { value: "   " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject signup" }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it("confirms with the trimmed reason when one is typed", () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(
      screen.getByLabelText("Rejection reason (optional)"),
      { target: { value: "  Too far away  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject signup" }));
    expect(onConfirm).toHaveBeenCalledWith("Too far away");
  });

  it("Cancel fires onCancel", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("busy disables both buttons and shows the in-flight label", () => {
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: "Rejecting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
