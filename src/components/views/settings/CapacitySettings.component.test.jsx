import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapacitySettings } from "./CapacitySettings.jsx";
import { LARGE_DOG_SLOTS } from "../../../constants/salon";

describe("CapacitySettings", () => {
  it("shows every hardcoded large-dog slot", () => {
    // Driven straight off the engine constant, so the card can never
    // disagree with what canBookSlot actually enforces.
    render(<CapacitySettings />);
    for (const time of Object.keys(LARGE_DOG_SLOTS)) {
      expect(screen.getAllByText(time).length).toBeGreaterThan(0);
    }
  });

  it("is read-only — no toggle, chips, or inputs (AUDIT-1)", () => {
    // The old card wrote salon_config.large_dog_slots / enforce_capacity,
    // which nothing reads. Honest card = zero interactive controls.
    render(<CapacitySettings />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("explains the seat sequence rather than size quotas", () => {
    render(<CapacitySettings />);

    expect(screen.getByText(/Each time slot normally has two seats/i)).toBeInTheDocument();
    expect(screen.getByText(/not quotas by dog size/i)).toBeInTheDocument();
  });
});
