import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookingCustomerPane } from "./BookingCustomerPane.jsx";

function renderPane(overrides = {}) {
  const props = {
    expandedSection: "customer",
    bookingSuggested: false,
    suggestionDismissed: false,
    onExpand: vi.fn(),
    onDismissSuggestion: vi.fn(),
    bookingPane: <div>Diary</div>,
    customerPane: <div>Customer details</div>,
    ...overrides,
  };
  return { ...render(<BookingCustomerPane {...props} />), props };
}

describe("BookingCustomerPane", () => {
  it("shows a suggestion without opening Booking and keeps dismissal for the session", () => {
    const onExpand = vi.fn();
    const onDismissSuggestion = vi.fn();
    const { rerender } = render(<BookingCustomerPane
      expandedSection="customer"
      bookingSuggested
      suggestionDismissed={false}
      onExpand={onExpand}
      onDismissSuggestion={onDismissSuggestion}
      bookingPane={<div>Diary</div>}
      customerPane={<div>Customer details</div>}
    />);
    expect(screen.getByText("Booking suggested")).toBeInTheDocument();
    expect(onExpand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
    expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
    rerender(<BookingCustomerPane
      expandedSection="customer"
      bookingSuggested
      suggestionDismissed
      onExpand={onExpand}
      onDismissSuggestion={onDismissSuggestion}
      bookingPane={<div>Diary</div>}
      customerPane={<div>Customer details</div>}
    />);
    expect(screen.queryByText("Booking suggested")).not.toBeInTheDocument();
  });

  it("opens on Customer and keeps both 44px headers reachable", () => {
    renderPane();

    const booking = screen.getByRole("button", { name: /^Booking/ });
    const customer = screen.getByRole("button", { name: /^Customer/ });

    expect(booking.className).toContain("min-h-11");
    expect(customer.className).toContain("min-h-11");
    expect(booking).toHaveAttribute("aria-expanded", "false");
    expect(customer).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Customer details")).toBeInTheDocument();
    expect(screen.queryByText("Diary")).not.toBeInTheDocument();
  });

  it("expands Booking only when its header is pressed", () => {
    const { props } = renderPane();

    fireEvent.click(screen.getByRole("button", { name: /^Booking/ }));
    expect(props.onExpand).toHaveBeenCalledWith("booking");
    expect(props.onExpand).toHaveBeenCalledTimes(1);
  });

  it("lets the Booking pane own its own scrolling so its footer stays pinned", () => {
    renderPane({ expandedSection: "booking" });

    // Booking pins its date strip and draft-offer footer and scrolls the slot
    // list itself; a scrollbar here too would push Insert into reply off-screen.
    const body = screen.getByText("Diary").parentElement;
    expect(body.className).toContain("overflow-hidden");
    expect(body.className).not.toContain("overflow-y-auto");
    expect(body.className).toContain("min-h-0");
    expect(screen.queryByText("Customer details")).not.toBeInTheDocument();
    // The collapsed section's header stays reachable.
    expect(screen.getByRole("button", { name: /^Customer/ })).toBeInTheDocument();
  });

  it("scrolls the Customer body itself", () => {
    renderPane({ expandedSection: "customer" });

    const body = screen.getByText("Customer details").parentElement;
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).toContain("min-h-0");
  });

  it("offers no dismissal control when nothing is suggested", () => {
    renderPane({ bookingSuggested: false });
    expect(
      screen.queryByRole("button", { name: "Dismiss suggestion" }),
    ).not.toBeInTheDocument();
  });
});
