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

  it("takes a custom label", () => {
    render(<NeedsAttentionFrame label="Needs attention: clash"><p>x</p></NeedsAttentionFrame>);
    expect(screen.getByRole("group", { name: "Needs attention: clash" })).toBeInTheDocument();
  });
});
