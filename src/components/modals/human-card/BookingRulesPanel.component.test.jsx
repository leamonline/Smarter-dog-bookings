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

const openSection = (name) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^edit ${name}`, "i") }));

describe("BookingRulesPanel", () => {
  it("is collapsed by default: no slot chips, summaries read None", () => {
    render(<BookingRulesPanel human={human()} onUpdateHuman={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /preferred 09:00/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /blocked 09:00/i })).toBeNull();
    expect(screen.getAllByText("None")).toHaveLength(2);
  });

  it("summarises the times that are set while collapsed", () => {
    render(
      <BookingRulesPanel
        human={human({ preferredSlots: ["09:00", "10:30"], blockedSlots: ["13:00"] })}
        onUpdateHuman={vi.fn()}
      />,
    );
    expect(screen.getByText("09:00, 10:30")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
  });

  it("Edit reveals the chips and Done hides them again", () => {
    render(<BookingRulesPanel human={human()} onUpdateHuman={vi.fn()} />);
    openSection("preferred times");
    expect(screen.getByRole("button", { name: /preferred 09:00/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^done editing preferred times/i }));
    expect(screen.queryByRole("button", { name: /preferred 09:00/i })).toBeNull();
  });

  it("marks a preferred slot and reports it", () => {
    const onUpdateHuman = vi.fn();
    render(<BookingRulesPanel human={human()} onUpdateHuman={onUpdateHuman} />);
    openSection("preferred times");
    fireEvent.click(screen.getByRole("button", { name: /preferred 09:00/i }));
    expect(onUpdateHuman).toHaveBeenCalledWith("h1", { preferredSlots: ["09:00"] });
  });

  it("blocking a slot clears it from preferred (mutual exclusion)", () => {
    const onUpdateHuman = vi.fn();
    render(
      <BookingRulesPanel human={human({ preferredSlots: ["09:00"] })} onUpdateHuman={onUpdateHuman} />,
    );
    openSection("blocked times");
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
    openSection("blocked times");
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
    openSection("preferred times");
    expect(screen.getByRole("button", { name: /preferred 09:00/i })).toBeDisabled();
  });
});
