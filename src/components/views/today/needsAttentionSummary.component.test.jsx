// The attention strip in the day's header: "Everything's on track", or exactly
// what is not, one segment per reason.
//
// `buildAttentionSummary` itself is unit-tested in src/engine/salonBoard.test.ts;
// this file is about what the strip renders from it and what a press means.
// (Moved out of the four-zone board's test file when the board was deleted,
// October 2026, #995 — the strip outlived the board.)
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS } from "../../../constants/index";
import { buildDailyBriefBoard } from "../../../engine/dailyBrief";
import { buildBoardTokens, buildAttentionSummary } from "../../../engine/salonBoard";
import { NeedsAttentionSummary } from "./NeedsAttentionSummary.jsx";

const NOW = new Date("2026-07-14T09:00:00Z"); // 10:00 London
const TODAY = "2026-07-14";

function booking(overrides) {
  return {
    dogName: "Dog",
    breed: "Cockapoo",
    size: "small",
    service: "full-groom",
    owner: "Rik Patel",
    status: BOOKING_STATUS.BOOKED,
    slot: "11:00",
    addons: [],
    payment: "Due at Pick-up",
    _dogId: `dog-${overrides.id}`,
    _ownerId: `owner-${overrides.id}`,
    _bookingDate: TODAY,
    ...overrides,
  };
}

function tokensFor(bookings, isToday = true) {
  const board = buildDailyBriefBoard(bookings, TODAY, NOW);
  return buildBoardTokens({ board, now: NOW, isToday });
}

describe("needs attention", () => {
  const attentionBookings = [
    booking({ id: "a", dogName: "Late", slot: "08:30" }),
    booking({ id: "b", dogName: "Calm", slot: "12:30", payment: "Paid in Full" }),
  ];

  it("reassures instead of showing an empty warning area when nothing is wrong", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30", payment: "Paid in Full" })]), true);
    render(<NeedsAttentionSummary summary={summary} isToday activeReason={null} onSelectReason={() => {}} />);
    expect(screen.getByText("Everything's on track")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("itemises the reasons so the number defines itself, one segment per press", () => {
    const onSelectReason = vi.fn();
    const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
    const summary = buildAttentionSummary(tokensFor([
      booking({ id: "a", dogName: "Late", slot: "08:30" }),
      booking({ id: "w", dogName: "Waiting", status: BOOKING_STATUS.READY_FOR_COLLECTION, readyAt: at(30) }),
    ]), true);
    render(
      <NeedsAttentionSummary
        summary={summary}
        dueNow={52}
        isToday
        activeReason={null}
        onSelectReason={onSelectReason}
      />,
    );

    // No opaque total — each segment names its reason and count.
    expect(screen.queryByText(/things need you/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlight 1 late/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlight 1 waiting/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Highlight £52 due/ }));
    expect(onSelectReason).toHaveBeenCalledWith("unpaid");
  });

  it("marks the active segment and clears it on a second press", () => {
    const onSelectReason = vi.fn();
    const summary = buildAttentionSummary(tokensFor(attentionBookings), true);
    render(
      <NeedsAttentionSummary
        summary={summary}
        isToday
        activeReason="late"
        onSelectReason={onSelectReason}
      />,
    );
    const active = screen.getByRole("button", { name: "Stop highlighting 1 late" });
    expect(active).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(active);
    expect(onSelectReason).toHaveBeenCalledWith(null);
  });

  it("stays quiet on a browsed date — nothing on it is happening now", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "b", slot: "12:30" })], false), false);
    const { container } = render(
      <NeedsAttentionSummary summary={summary} isToday={false} activeReason={null} onSelectReason={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
