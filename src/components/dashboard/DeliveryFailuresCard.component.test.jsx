// DeliveryFailuresCard tests — focus on the clickable failure rows added for
// issue #352 (each row jumps the calendar to that booking's day).
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// The card calls useDeliveryFailures() as a fallback even when `data` is
// passed; stub the module (and its triggerLabel export) so the test needs no
// Supabase client.
vi.mock("../../supabase/hooks/useDeliveryFailures", () => ({
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

  it("renders a dismiss button per row and calls dismiss with the booking id", () => {
    const dismiss = vi.fn();
    render(
      <DeliveryFailuresCard data={{ ...data, dismiss }} onSelectFailure={vi.fn()} />,
    );
    const btn = screen.getByRole("button", { name: "Dismiss Ada · Rex" });
    btn.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("b1");
  });

  it("renders no dismiss button when dismiss is unavailable", () => {
    render(<DeliveryFailuresCard data={data} onSelectFailure={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /^Dismiss / }),
    ).not.toBeInTheDocument();
  });

  it("keeps the jump-to-booking button working alongside dismiss", () => {
    const onSelectFailure = vi.fn();
    render(
      <DeliveryFailuresCard
        data={{ ...data, dismiss: vi.fn() }}
        onSelectFailure={onSelectFailure}
      />,
    );
    screen.getByRole("button", { name: /Open Ada's booking/i }).click();
    expect(onSelectFailure).toHaveBeenCalledWith(data.failures[0]);
  });
});

describe("DeliveryFailuresCard: unconfirmed rows (#1017)", () => {
  it("labels an unconfirmed row 'not confirmed', and a reported failure 'failed'", () => {
    render(
      <DeliveryFailuresCard
        data={{
          count: 2,
          loading: false,
          failures: [
            { bookingId: "b1", customerName: "Ada", dogName: "Rex", triggers: ["cancelled"], unconfirmed: true, bookingDate: null },
            { bookingId: "b2", customerName: "Bea", dogName: null, triggers: ["reminder"], unconfirmed: false, bookingDate: null },
          ],
        }}
      />,
    );
    expect(screen.getByText(/cancelled not confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/reminder failed/)).toBeInTheDocument();
  });

  it("does not call the card's messages 'failed' when every one is unconfirmed", () => {
    render(
      <DeliveryFailuresCard
        data={{
          count: 1,
          loading: false,
          failures: [
            { bookingId: "b1", customerName: "Ada", dogName: "Rex", triggers: ["cancelled"], unconfirmed: true, bookingDate: null },
          ],
        }}
      />,
    );
    expect(screen.getByText("message not confirmed as delivered")).toBeInTheDocument();
    expect(screen.queryByText(/messages? failed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 customer message not confirmed as delivered")).toBeInTheDocument();
  });

  it("keeps 'failed' on the card when any message is a reported failure", () => {
    render(
      <DeliveryFailuresCard
        data={{
          count: 2,
          loading: false,
          failures: [
            { bookingId: "b1", customerName: "Ada", dogName: "Rex", triggers: ["cancelled"], unconfirmed: true, bookingDate: null },
            { bookingId: "b2", customerName: "Bea", dogName: null, triggers: ["reminder"], unconfirmed: false, bookingDate: null },
          ],
        }}
      />,
    );
    expect(screen.getByText("messages failed")).toBeInTheDocument();
    expect(screen.getByLabelText("2 customer messages failed to deliver")).toBeInTheDocument();
  });
});
