import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NeedsAttentionContent } from "./NeedsAttentionView.jsx";
import { buildNeedsAttention } from "../../engine/needsAttention";
import { BOOKING_STATUS } from "../../constants/salon";

const TODAY = "2026-08-20";

function booking(overrides = {}) {
  return {
    id: "b1",
    slot: "09:00",
    dogName: "Rex",
    breed: "",
    size: "small",
    service: "full-groom",
    owner: "Sam Smith",
    status: BOOKING_STATUS.READY_FOR_COLLECTION,
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    paidAt: null,
    _dogId: null,
    _ownerId: null,
    _bookingDate: "2026-08-19",
    _groupId: null,
    ...overrides,
  };
}

function renderContent(bookings, props = {}) {
  const summary = buildNeedsAttention(bookings, TODAY);
  render(
    <NeedsAttentionContent
      loading={false}
      available={true}
      summary={summary}
      dogs={{}}
      humans={{}}
      onOpenBooking={() => {}}
      {...props}
    />,
  );
  return summary;
}

describe("NeedsAttentionContent", () => {
  it("shows the total and the three section counts", () => {
    renderContent([
      booking({ id: "a" }),
      booking({ id: "b", status: BOOKING_STATUS.ARRIVED }),
      booking({
        id: "c",
        status: BOOKING_STATUS.COMPLETED,
        payment: "Due at Pick-up",
      }),
    ]);
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText(/3 items from the last/)).toBeInTheDocument();
    expect(screen.getByText("Ready for collection")).toBeInTheDocument();
    expect(screen.getByText("Past appointment review")).toBeInTheDocument();
    expect(screen.getByText("Payment information")).toBeInTheDocument();
  });

  it("opens the existing booking detail when an item is clicked", () => {
    const onOpenBooking = vi.fn();
    const summary = buildNeedsAttention([booking()], TODAY);
    render(
      <NeedsAttentionContent
        loading={false}
        available={true}
        summary={summary}
        dogs={{}}
        humans={{}}
        onOpenBooking={onOpenBooking}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Rex/ }));
    expect(onOpenBooking).toHaveBeenCalledTimes(1);
    const [id, fallback] = onOpenBooking.mock.calls[0];
    expect(id).toBe("b1");
    expect(fallback.id).toBe("b1");
  });

  it("shows one row for a multi-dog group with both names", () => {
    renderContent([
      booking({ id: "a", _groupId: "g1", dogName: "Rex", slot: "09:00" }),
      booking({ id: "b", _groupId: "g1", dogName: "Fido", slot: "09:30" }),
    ]);
    expect(screen.getByText(/1 item from the last/)).toBeInTheDocument();
    expect(screen.getByText("Rex & Fido")).toBeInTheDocument();
  });

  it("uses neutral payment wording — never says the customer owes", () => {
    renderContent([
      booking({ id: "a", status: BOOKING_STATUS.COMPLETED, payment: "Due at Pick-up" }),
      booking({
        id: "b",
        status: BOOKING_STATUS.COMPLETED,
        payment: "Paid in Full",
        paidAt: null,
      }),
    ]);
    expect(screen.getByText(/Payment information missing/)).toBeInTheDocument();
    expect(screen.getByText(/Payment evidence incomplete/)).toBeInTheDocument();
    expect(screen.queryByText(/owes/i)).not.toBeInTheDocument();
  });

  it("leads with the oldest item and marks it as needing chasing", () => {
    renderContent([
      booking({ id: "fresh", _bookingDate: "2026-08-19", dogName: "Fresh" }),
      booking({ id: "stale", _bookingDate: "2026-07-22", dogName: "Stale" }),
    ]);
    const rows = screen.getAllByRole("button", { name: /Fresh|Stale/ });
    expect(rows[0]).toHaveTextContent("Stale");
    expect(rows[0]).toHaveTextContent("29 days ago");
    expect(rows[0]).toHaveTextContent("Needs chasing");
    expect(rows[1]).toHaveTextContent("Fresh");
    expect(rows[1]).toHaveTextContent("Yesterday");
    expect(screen.getByText("1 waiting more than a fortnight")).toBeInTheDocument();
  });

  it("omits the stale line when everything is recent", () => {
    renderContent([booking({ _bookingDate: "2026-08-19" })]);
    expect(screen.queryByText(/waiting more than a fortnight/)).not.toBeInTheDocument();
  });

  it("shows the all-clear state when nothing needs resolving", () => {
    renderContent([]);
    expect(screen.getByText("All clear")).toBeInTheDocument();
  });

  it("says it needs a connection when data is unavailable", () => {
    render(
      <NeedsAttentionContent
        loading={false}
        available={false}
        summary={buildNeedsAttention([], TODAY)}
        dogs={{}}
        humans={{}}
        onOpenBooking={() => {}}
      />,
    );
    expect(screen.getByText(/Needs a live connection/)).toBeInTheDocument();
  });
});
