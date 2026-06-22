// Validation test for Hours (P1 batch C): a closing time that isn't after the
// opening time surfaces an inline error and blocks the save.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { HoursSettings } from "./HoursSettings.jsx";

const config = {
  businessHours: { Monday: { open: "09:00", close: "17:00", closed: false } },
  closures: [],
};

describe("HoursSettings validation", () => {
  it("flags close-not-after-open and disables Save", () => {
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={vi.fn()} canEdit />,
    );
    const times = container.querySelectorAll('input[type="time"]');
    // Monday is the first open day → times[0]=open, times[1]=close.
    fireEvent.change(times[1], { target: { value: "08:00" } }); // before the 09:00 open

    expect(screen.getByRole("alert")).toHaveTextContent(/closing time must be after opening time/i);
    expect(times[1]).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /save hours/i })).toBeDisabled();
  });

  it("accepts a valid range — no error, Save enabled", () => {
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={vi.fn()} canEdit />,
    );
    const times = container.querySelectorAll('input[type="time"]');
    fireEvent.change(times[1], { target: { value: "18:00" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save hours/i })).toBeEnabled();
  });
});
