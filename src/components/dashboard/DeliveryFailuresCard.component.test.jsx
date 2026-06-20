// DeliveryFailuresCard tests — focus on the clickable failure rows added for
// issue #352 (each row jumps the calendar to that booking's day).
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// The card calls useDeliveryFailures() as a fallback even when `data` is
// passed; stub the module (and its triggerLabel export) so the test needs no
// Supabase client.
vi.mock("../../supabase/hooks/useDeliveryFailures.js", () => ({
  useDeliveryFailures: () => ({ failures: [], count: 0, loading: false }),
  triggerLabel: (t) => t,
}));

import { DeliveryFailuresCard } from "./DeliveryFailuresCard.jsx";

const data = {
  count: 2,
  loading: false,
  failures: [
    {
      bookingId: "b1",
      customerName: "Ada",
      dogName: "Rex",
      triggers: ["confirmation"],
      bookingDate: "2026-06-20",
    },
    {
      bookingId: "b2",
      customerName: "Bea",
      dogName: null,
      triggers: ["reminder"],
      bookingDate: "2026-06-21",
    },
  ],
};

describe("DeliveryFailuresCard", () => {
  it("renders a clickable row per failure and reports the clicked one", () => {
    const onSelectFailure = vi.fn();
    render(<DeliveryFailuresCard data={data} onSelectFailure={onSelectFailure} />);

    const row = screen.getByRole("button", { name: /Open Ada's booking/i });
    row.click();

    expect(onSelectFailure).toHaveBeenCalledTimes(1);
    expect(onSelectFailure).toHaveBeenCalledWith(data.failures[0]);
  });

  it("renders non-interactive rows when no handler is provided", () => {
    render(<DeliveryFailuresCard data={data} />);
    // Customer names still show, but there are no failure buttons to click.
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /booking/i }),
    ).not.toBeInTheDocument();
  });
});
