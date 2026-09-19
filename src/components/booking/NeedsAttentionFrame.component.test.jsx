import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NeedsAttentionFrame } from "./NeedsAttentionFrame.jsx";

describe("NeedsAttentionFrame", () => {
  it("renders its child", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("shows the NEEDS ATTENTION tag", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(screen.getByText("NEEDS ATTENTION")).toBeInTheDocument();
  });

  it("announces why to assistive tech", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(
      screen.getByRole("group", { name: "Needs attention: booked during a closure" }),
    ).toBeInTheDocument();
  });

  it("pulses the stripes only, never the booking underneath", () => {
    const { container } = render(
      <NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>,
    );
    // The animated layer must not be an ancestor of the content: CSS opacity
    // applies to the whole subtree, so pulsing a wrapper fades the booking —
    // making the one card staff most need to read the hardest to read.
    const pulsing = container.querySelector(".needs-attention-pulse");
    expect(pulsing).not.toBeNull();
    expect(pulsing).toHaveClass("needs-attention-stripes");
    expect(pulsing.contains(screen.getByText("Bella"))).toBe(false);
  });

  it("takes a custom label", () => {
    render(<NeedsAttentionFrame label="Needs attention: clash"><p>x</p></NeedsAttentionFrame>);
    expect(screen.getByRole("group", { name: "Needs attention: clash" })).toBeInTheDocument();
  });
});
