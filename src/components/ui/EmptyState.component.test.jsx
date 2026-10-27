import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.jsx";

describe("EmptyState", () => {
  it("says what is empty and offers the next step", () => {
    render(<EmptyState title="No dogs just yet" description="Add a dog and they'll appear here." action={<button>Add dog</button>} />);
    expect(screen.getByText("No dogs just yet")).toBeInTheDocument();
    expect(screen.getByText("Add a dog and they'll appear here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add dog" })).toBeInTheDocument();
  });

  it("draws nothing decorative by default", () => {
    const { container } = render(<EmptyState title="Nothing matches" />);
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("can show the salon's dog mark, hidden from assistive technology", () => {
    const { container } = render(<EmptyState mark="dog" title="No dogs just yet" />);
    const mark = container.querySelector(".sd-dog-mark");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.textContent).toBe("");
  });

  it("ignores an unknown mark rather than drawing something unintended", () => {
    const { container } = render(<EmptyState mark="paw" title="x" />);
    expect(container.querySelector(".sd-dog-mark")).toBeNull();
  });
});
