import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { HoursSettings } from "./HoursSettings.jsx";

const config = {
  businessHours: { Monday: { open: "09:00", close: "17:00", closed: false } },
  closures: [{ date: "2026-12-25", label: "Christmas Day" }],
};

describe("HoursSettings read-only reference data", () => {
  it("shows stored weekly hours and closures without offering live controls", () => {
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={vi.fn()} canEdit />,
    );
    const times = container.querySelectorAll('input[type="time"]');

    expect(times.length).toBeGreaterThan(0);
    for (const time of times) expect(time).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove closure 2026-12-25" })).toBeDisabled();
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
    expect(screen.getByLabelText("Closure label (optional)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByText(/These weekly hours are saved reference only; they do not control live availability/i)).toBeInTheDocument();
    expect(screen.getByText("Reference closures")).toBeInTheDocument();
  });
});
