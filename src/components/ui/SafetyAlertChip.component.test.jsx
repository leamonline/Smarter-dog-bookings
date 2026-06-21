import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SafetyAlertChip } from "./SafetyAlertChip.jsx";

describe("SafetyAlertChip", () => {
  it("renders nothing when there are no alerts", () => {
    const { container } = render(<SafetyAlertChip items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("ignores empty/falsy entries", () => {
    const { container } = render(<SafetyAlertChip items={["", null, undefined]} />);
    expect(container.firstChild).toBeNull();
  });

  it("exposes the full, comma-joined alert list to screen readers regardless of truncation", () => {
    render(<SafetyAlertChip items={["Reactive to dogs", "Bites", "Resource guards"]} />);
    // The accessible name carries every alert even though the visible text is
    // collapsed to "first +N".
    expect(
      screen.getByRole("button", {
        name: "Safety alert: Reactive to dogs, Bites, Resource guards",
      }),
    ).toBeInTheDocument();
  });

  it("collapses multiple alerts to a +N count by default", () => {
    render(<SafetyAlertChip items={["Reactive to dogs", "Bites", "Resource guards"]} />);
    expect(screen.getByText("Reactive to dogs +2")).toBeInTheDocument();
  });

  it("expands in place on click to reveal every alert, without bubbling to the card", () => {
    const onCardClick = vi.fn();
    render(
      <div role="button" tabIndex={0} onClick={onCardClick}>
        <SafetyAlertChip items={["Reactive to dogs", "Bites"]} />
      </div>,
    );
    const chip = screen.getByRole("button", { name: /Safety alert/ });
    expect(chip).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(chip);

    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reactive to dogs, Bites")).toBeInTheDocument();
    // The card behind the chip must NOT have been activated.
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("shows a single short flag as plain text with no expand affordance", () => {
    render(<SafetyAlertChip items={["Muzzle"]} />);
    const chip = screen.getByRole("button", { name: "Safety alert: Muzzle" });
    // Short, single value: nothing hidden, so no expanded/collapsed state.
    expect(chip).not.toHaveAttribute("aria-expanded");
    expect(screen.getByText("Muzzle")).toBeInTheDocument();
  });
});
