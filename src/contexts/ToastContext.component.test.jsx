// Toast actions. The toast already supported a single "Undo" action (a bare
// function). PR 2 generalises it to an { label, onClick } object so callers can
// label the action (e.g. "Book another for Emma") while keeping the legacy
// function form working.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

// Auto-dismiss timers must not outlive the provider. A timer left running
// after unmount fires setState into a dead root; under Vitest that lands
// after jsdom is torn down and fails the run as an unhandled error.
describe("ToastContext — auto-dismiss timers", () => {
  function PlainTrigger() {
    const toast = useToast();
    return <button onClick={() => toast.show("Saved")}>fire</button>;
  }

  it("clears every pending auto-dismiss timer when the provider unmounts", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <ToastProvider>
          <PlainTrigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText("fire"));
      fireEvent.click(screen.getByText("fire"));
      expect(screen.getAllByRole("status")).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(2);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the auto-dismiss timer when a toast is dismissed by hand", () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <PlainTrigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText("fire"));
      expect(vi.getTimerCount()).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
      expect(screen.queryByRole("status")).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still auto-dismisses a toast that is left alone", () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <PlainTrigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText("fire"));
      expect(screen.getByRole("status")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole("status")).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
