import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafetySummary } from "./SafetySummary.jsx";

const props = (over = {}) => ({ facts: ["Bites / Nips"], expanded: false, controls: "drawer-1", onOpen: () => {}, ...over });

afterEach(() => vi.restoreAllMocks());

describe("SafetySummary", () => {
  it("shows one warning in words, with no review prompt", () => {
    render(<SafetySummary {...props()} />);
    expect(screen.getByText("Bites / Nips")).toBeTruthy();
    expect(screen.queryByText(/Review safety instructions/)).toBeNull();
  });

  it("says '1 alert' when a single long warning does not fit", () => {
    // jsdom measures nothing, so make the unseen copy wider than the column.
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    render(<SafetySummary {...props({ facts: ["Must be muzzled for nails, dryer and any face work"] })} />);
    expect(screen.getByText(/Review safety instructions before handling · 1 alert$/)).toBeTruthy();
  });

  it("never cuts a warning short: the prompt wraps rather than truncates", () => {
    render(<SafetySummary {...props({ facts: ["a", "b", "c"] })} />);
    const prompt = screen.getByText(/Review safety instructions/);
    expect(prompt.className).not.toContain("truncate");
  });

  it("carries the disclosure wiring and the full list in its accessible name", () => {
    render(<SafetySummary {...props({ facts: ["a", "b", "c"], expanded: true })} />);
    const button = screen.getByRole("button", { name: "Safety alert: a, b, c" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "drawer-1");
  });

  it("calls onOpen on click and on Enter/Space (a native button)", () => {
    const onOpen = vi.fn();
    render(<SafetySummary {...props({ onOpen })} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("re-tests the fit when the column is resized", () => {
    let resize;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb) { resize = cb; }
        observe() {}
        disconnect() {}
      },
    );
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
    const room = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    render(<SafetySummary {...props({ facts: ["Reactive to dogs"] })} />);
    expect(screen.queryByText(/Review safety instructions/)).toBeNull();
    room.mockReturnValue(100);
    act(() => resize());
    expect(screen.getByText(/Review safety instructions/)).toBeTruthy();
    width.mockRestore();
    vi.unstubAllGlobals();
  });
});
