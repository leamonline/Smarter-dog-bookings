import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BookingRulesPanel } from "./BookingRulesPanel.jsx";

const human = (overrides = {}) => ({
  id: "h1",
  preferredSlots: [],
  blockedSlots: [],
  depositRequired: false,
  ...overrides,
});

describe("BookingRulesPanel", () => {
  it("marks a preferred slot and reports it", () => {
    const onUpdateHuman = vi.fn();
    render(<BookingRulesPanel human={human()} onUpdateHuman={onUpdateHuman} />);
    fireEvent.click(screen.getByRole("button", { name: /preferred 09:00/i }));
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", { preferredSlots: ["09:00"] });
  });

  it("blocking a slot clears it from preferred (mutual exclusion)", () => {
    const onUpdateHuman = vi.fn();
    render(
      <BookingRulesPanel human={human({ preferredSlots: ["09:00"] })} onUpdateHuman={onUpdateHuman} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /blocked 09:00/i }));
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", {
      blockedSlots: ["09:00"],
      preferredSlots: [],
    });
  });

  it("unpicking a selected slot removes it", () => {
    const onUpdateHuman = vi.fn();
    render(
      <BookingRulesPanel human={human({ blockedSlots: ["10:00"] })} onUpdateHuman={onUpdateHuman} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /blocked 10:00/i }));
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", { blockedSlots: [] });
  });

  it("toggles the deposit tag", () => {
    const onUpdateHuman = vi.fn();
    render(<BookingRulesPanel human={human()} onUpdateHuman={onUpdateHuman} />);
    fireEvent.click(screen.getByRole("switch", { name: /deposit required/i }));
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", { depositRequired: true });
  });

  it("read-only without onUpdateHuman", () => {
    render(<BookingRulesPanel human={human()} onUpdateHuman={undefined} />);
    expect(screen.getByRole("button", { name: /preferred 09:00/i })).toBeDisabled();
  });
});
