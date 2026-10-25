import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorBanner } from "./ErrorBanner";

// The title sits on red-100 (#FEE2E2). brand-red (#DC2626) is only 3.95:1
// there; red-800 (#991B1B) is 6.8:1, which clears AA for the 14px bold title.
describe("ErrorBanner", () => {
  it("announces the title and message", () => {
    render(<ErrorBanner title="Couldn't load the dogs directory" message="The connection dropped." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the dogs directory");
    expect(alert).toHaveTextContent("The connection dropped.");
  });

  it("keeps the default warm title", () => {
    render(<ErrorBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't quite work");
  });

  it("calls retry and onClose from their buttons", () => {
    const retry = vi.fn();
    const onClose = vi.fn();
    render(<ErrorBanner message="Nope." retry={retry} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Give it another go" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sets the title in a dark red that reads on the pale red panel", () => {
    render(<ErrorBanner title="Couldn't save" />);
    const cls = screen.getByText("Couldn't save").className;
    expect(cls).toMatch(/(^|\s)text-red-800(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)text-brand-red(\s|$)/);
  });
});
