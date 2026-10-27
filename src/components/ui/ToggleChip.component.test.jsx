import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleChip } from "./ToggleChip.jsx";

describe("ToggleChip", () => {
  it("is a button that reports its state as pressed or not", () => {
    const { rerender } = render(<ToggleChip pressed={false}>Flea bath</ToggleChip>);
    const chip = screen.getByRole("button", { name: "Flea bath" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    rerender(<ToggleChip pressed>Flea bath</ToggleChip>);
    expect(screen.getByRole("button", { name: "Flea bath" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not rely on colour: the pressed chip carries a tick, the idle one does not", () => {
    const { container, rerender } = render(<ToggleChip pressed={false}>Unread</ToggleChip>);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<ToggleChip pressed>Unread</ToggleChip>);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("never submits a form by accident", () => {
    render(<ToggleChip pressed={false}>x</ToggleChip>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("calls onClick, and not when disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<ToggleChip pressed={false} onClick={onClick}>x</ToggleChip>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<ToggleChip pressed={false} onClick={onClick} disabled>x</ToggleChip>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows a count when given one, including zero", () => {
    render(<ToggleChip pressed={false} count={0}>Drafts</ToggleChip>);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("keeps the 44px touch floor and falls back to safe defaults for unknown options", () => {
    render(<ToggleChip pressed tone="nope" size="nope">x</ToggleChip>);
    const chip = screen.getByRole("button");
    expect(chip.className).toContain("pointer-coarse:min-h-11");
    expect(chip.className).toContain("bg-ink");
  });
});
