import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DogSizeMark, HumanInitials, ProfileArrow } from "./IdentityMarker.jsx";

describe("HumanInitials", () => {
  it.each([
    ["Mollie Bennett", "MB"],
    ["Mary Jane Smith", "MS"],
    ["Prince", "P"],
    ["", "?"],
  ])("derives initials for %s", (name, initials) => {
    render(<HumanInitials fullName={name} />);
    expect(screen.getByTestId("human-initials")).toHaveTextContent(initials);
  });
});

describe("DogSizeMark", () => {
  it.each([
    ["small", "small", "text-brand-yellow-dark"],
    ["medium", "medium", "text-brand-teal-dark"],
    ["large", "large", "text-brand-coral-dark"],
    [null, "unknown", "text-slate-500"],
  ])("maps %s to the authoritative size tone", (size, tone, silhouetteClass) => {
    render(<DogSizeMark size={size} />);
    const mark = screen.getByRole("img", {
      name: new RegExp(tone === "unknown" ? "size unknown" : `${tone} dog`, "i"),
    });
    expect(mark).toHaveAttribute("data-size-tone", tone);
    expect(mark.querySelector(".dog-size-mark__silhouette")).toHaveClass(silhouetteClass);
  });

  it("can be decorative when written size is already present", () => {
    render(<DogSizeMark size="small" decorative />);
    const mark = screen.getByTestId("dog-size-mark");

    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("role");
    expect(mark).not.toHaveAttribute("aria-label");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("ProfileArrow", () => {
  it("is a labelled 44px button that invokes its action", () => {
    const onClick = vi.fn();
    render(<ProfileArrow label="Open Mollie's profile" onClick={onClick} />);

    const arrow = screen.getByRole("button", { name: "Open Mollie's profile" });
    expect(arrow).toHaveClass("size-11");
    fireEvent.click(arrow);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
