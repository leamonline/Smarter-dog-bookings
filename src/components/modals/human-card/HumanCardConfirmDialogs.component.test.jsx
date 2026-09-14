// HumanCardConfirmDialogs — the discard / delete / archive confirms of the
// Human card (Debt 7; pure move). Each renders only on its flag and routes
// its two buttons to the right handler.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HumanCardConfirmDialogs } from "./HumanCardConfirmDialogs.jsx";

function renderDialogs(flags = {}) {
  const handlers = {
    onDiscardEdits: vi.fn(),
    onKeepEditing: vi.fn(),
    onConfirmDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmArchive: vi.fn(),
    onCancelArchive: vi.fn(),
  };
  render(<HumanCardConfirmDialogs {...handlers} {...flags} />);
  return handlers;
}

describe("HumanCardConfirmDialogs", () => {
  it("renders nothing when no confirm is pending", () => {
    renderDialogs();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("discard: Discard vs Keep editing", () => {
    const h = renderDialogs({ pendingExit: true });
    expect(screen.getByText("Throw away changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(h.onDiscardEdits).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(h.onKeepEditing).toHaveBeenCalledTimes(1);
    expect(h.onConfirmDelete).not.toHaveBeenCalled();
  });

  it("delete: Delete person vs cancel", () => {
    const h = renderDialogs({ pendingDelete: true });
    expect(screen.getByText("Delete this person?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete person" }));
    expect(h.onConfirmDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(h.onCancelDelete).toHaveBeenCalledTimes(1);
  });

  it("archive: Archive vs Cancel", () => {
    const h = renderDialogs({ pendingArchive: true });
    expect(screen.getByText("Archive this person?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(h.onConfirmArchive).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onCancelArchive).toHaveBeenCalledTimes(1);
  });
});
