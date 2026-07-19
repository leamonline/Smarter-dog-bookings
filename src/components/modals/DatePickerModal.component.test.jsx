import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePickerModal } from "./DatePickerModal.jsx";

describe("DatePickerModal closed-date selection", () => {
  const currentDate = new Date(2026, 6, 14);
  const dayOpenState = { "2026-07-16": false };

  it("keeps closed dates disabled for existing calendar callers", () => {
    render(<DatePickerModal currentDate={currentDate} dayOpenState={dayOpenState} onSelectDate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Thursday,? 16 July 2026, salon closed/i })).toBeDisabled();
  });

  it("lets Daily Brief select a closed date", () => {
    const onSelectDate = vi.fn();
    render(<DatePickerModal currentDate={currentDate} dayOpenState={dayOpenState} allowClosedDates onSelectDate={onSelectDate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Thursday,? 16 July 2026, salon closed/i }));
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 6, 16));
  });
});
