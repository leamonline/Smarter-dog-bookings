// The inbox's "E" shortcut resolves the selected conversation, but never
// from inside a modal dialog stacked over the inbox (the re-enable dialog,
// a customer profile): E there must not close the chat behind it.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkCompleteButton } from "./MarkCompleteButton.jsx";

const conversation = { id: "conv-1", closed_at: null };

function renderButton(props = {}) {
  const onResolve = vi.fn();
  const onReopen = vi.fn();
  render(
    <MarkCompleteButton conversation={conversation} onResolve={onResolve} onReopen={onReopen} {...props} />,
  );
  return { onResolve, onReopen };
}

function modalWithButton() {
  const modal = document.createElement("div");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const button = document.createElement("button");
  button.textContent = "Keep it off";
  modal.appendChild(button);
  document.body.appendChild(modal);
  return { modal, button };
}

describe("MarkCompleteButton — the E shortcut", () => {
  it("resolves the conversation when no modal has focus", () => {
    const { onResolve } = renderButton();
    fireEvent.keyDown(window, { key: "e" });
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it("reopens a closed conversation", () => {
    const { onReopen, onResolve } = renderButton({ conversation: { ...conversation, closed_at: "2026-10-14T09:00:00Z" } });
    fireEvent.keyDown(window, { key: "E" });
    expect(onReopen).toHaveBeenCalledTimes(1);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("does nothing while focus is inside a modal dialog", () => {
    const { onResolve } = renderButton();
    const { modal, button } = modalWithButton();
    try {
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.keyDown(window, { key: "e" });
      expect(onResolve).not.toHaveBeenCalled();

      modal.tabIndex = -1;
      modal.focus();
      fireEvent.keyDown(window, { key: "e" });
      expect(onResolve).not.toHaveBeenCalled();
    } finally {
      modal.remove();
    }
    // Back on the page, the shortcut works again.
    fireEvent.keyDown(window, { key: "e" });
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it("says a thread closed itself when the booking confirmation went out", () => {
    // whatsapp-send closes the thread with the booking reason and no closed_by.
    renderButton({
      conversation: { ...conversation, closed_at: "2026-10-23T09:00:00Z", closure_reason: "booking_confirmed_quiet", closed_by: null },
    });
    expect(screen.getByRole("button", { name: "Reopen conversation" })).toHaveAttribute(
      "title",
      "Bring this conversation back into the active queue (was closed automatically when the booking confirmation was sent). Shortcut: E",
    );
  });

  it("still credits staff who accepted a booking + quiet suggestion", () => {
    renderButton({
      conversation: { ...conversation, closed_at: "2026-10-23T09:00:00Z", closure_reason: "booking_confirmed_quiet", closed_by: "user-1" },
    });
    expect(screen.getByRole("button", { name: "Reopen conversation" })).toHaveAttribute(
      "title",
      "Bring this conversation back into the active queue (was closed after booking + quiet). Shortcut: E",
    );
  });

  it("leaves typing alone, and modified keys", () => {
    const { onResolve } = renderButton();
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    try {
      input.focus();
      fireEvent.keyDown(window, { key: "e" });
    } finally {
      input.remove();
    }
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mark conversation complete" })).toBeInTheDocument();
  });
});
