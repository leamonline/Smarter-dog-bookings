import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuItem } from "./MenuItem.jsx";

describe("MenuItem", () => {
  it("is a menuitem button that never submits a form", () => {
    render(<div role="menu"><MenuItem>Edit</MenuItem></div>);
    const item = screen.getByRole("menuitem", { name: "Edit" });
    expect(item.tagName).toBe("BUTTON");
    expect(item).toHaveAttribute("type", "button");
  });

  it("calls onClick, and not when disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<MenuItem onClick={onClick}>Edit</MenuItem>);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<MenuItem onClick={onClick} disabled>Edit</MenuItem>);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hides a decorative icon from assistive technology and keeps the label as the name", () => {
    render(<MenuItem icon={<svg data-testid="i" />}>Delete</MenuItem>);
    expect(screen.getByTestId("i").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("styles the destructive row in the existing danger ink, and falls back for unknown tones", () => {
    const { rerender } = render(<MenuItem tone="danger">Delete</MenuItem>);
    expect(screen.getByRole("menuitem").className).toContain("text-brand-coral-text");
    rerender(<MenuItem tone="nope">Delete</MenuItem>);
    expect(screen.getByRole("menuitem").className).toContain("text-slate-700");
  });

  it("keeps the 44px touch floor", () => {
    render(<MenuItem>Edit</MenuItem>);
    expect(screen.getByRole("menuitem").className).toContain("pointer-coarse:min-h-11");
  });
});
