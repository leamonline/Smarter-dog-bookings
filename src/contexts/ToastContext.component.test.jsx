// Toast actions. The toast already supported a single "Undo" action (a bare
// function). PR 2 generalises it to an { label, onClick } object so callers can
// label the action (e.g. "Book another for Emma") while keeping the legacy
// function form working.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext.jsx";

function Trigger({ action }) {
  const toast = useToast();
  return <button onClick={() => toast.show("Saved", "success", action)}>fire</button>;
}

describe("ToastContext — actions", () => {
  it("renders a custom-labelled action and fires its onClick (object form)", () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Trigger action={{ label: "Book another", onClick }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByRole("button", { name: "Book another" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("treats a bare function as the legacy 'Undo' action", () => {
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Trigger action={undo} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
