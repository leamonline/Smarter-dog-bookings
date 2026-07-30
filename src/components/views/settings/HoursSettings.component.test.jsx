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
  it("shows persisted reference hours and directs one-off changes through Bookings", () => {
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={vi.fn()} canEdit />,
    );
    const times = container.querySelectorAll('input[type="time"]');

    expect(times.length).toBeGreaterThan(0);
    expect(times[0]).toHaveValue("09:00");
    expect(times[1]).toHaveValue("17:00");
    for (const time of times) expect(time).toBeDisabled();
    expect(screen.getByText("2026-12-25 — Christmas Day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove closure 2026-12-25" })).toBeDisabled();
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
    expect(screen.getByLabelText("Closure label (optional)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByText(/These weekly hours are saved reference only/i)).toHaveTextContent(
      "These weekly hours are saved reference only; they do not control live availability. For a one-off change, use Bookings, select the date, then choose Open this day or Close this day. Permanent weekly changes currently need an approved deployment.",
    );
    expect(screen.getByText("Reference closures")).toBeInTheDocument();
  });
});
