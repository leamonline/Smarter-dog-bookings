// Tests for the canonical status line, honest wait-time colours, and the
// consolidated attention card. The wait tone must come from the named
// thresholds alone — never from the section a card sits in, and never green —
// and a booking's single card must carry every action its old duplicate rows
// offered.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AttentionPanel } from "./AttentionPanel.jsx";
import {
  BookingStatusLine,
  WaitBadge,
  waitTone,
  WAIT_AMBER_MINUTES,
  WAIT_RED_MINUTES,
} from "./parts.jsx";

describe("waitTone thresholds", () => {
  it("is neutral under the amber threshold, amber at 60+, red at 120+", () => {
    expect(waitTone(null)).toBe("neutral");
    expect(waitTone(0)).toBe("neutral");
    expect(waitTone(WAIT_AMBER_MINUTES - 1)).toBe("neutral");
    expect(waitTone(WAIT_AMBER_MINUTES)).toBe("amber");
    expect(waitTone(WAIT_RED_MINUTES - 1)).toBe("amber");
    expect(waitTone(WAIT_RED_MINUTES)).toBe("red");
    expect(waitTone(9 * 60 + 42)).toBe("red");
  });
});

describe("WaitBadge", () => {
  it("never renders a wait in green, whatever the duration", () => {
    for (const mins of [5, 59, 60, 119, 120, 582]) {
      const { container, unmount } = render(<WaitBadge minutes={mins} />);
      expect(container.querySelector("span").className).not.toMatch(/emerald|green/);
      unmount();
    }
  });

  it("tones a long wait red and keeps the duration text", () => {
    const { container } = render(<WaitBadge minutes={582} withWord={false} />);
    const el = container.querySelector("span");
    expect(el).toHaveTextContent("9 hr 42 min");
    expect(el.className).toContain("text-brand-coral-text");
  });

  it("keeps the word 'waiting' where the headline doesn't already say it", () => {
    render(<WaitBadge minutes={25} />);
    expect(screen.getByText("waiting 25 min")).toBeInTheDocument();
  });
});

describe("BookingStatusLine", () => {
  const readyBooking = {
    status: "Ready for pick-up",
    readyAt: "2026-07-02T10:00:00Z", // 11:00 London (BST)
    collectionSentAt: null,
  };

  it("shows status + since-time, wait, message state and payment in order", () => {
    render(
      <BookingStatusLine
        booking={readyBooking}
        waitMinutes={135}
        pay={{ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 }}
      />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("since 11:00")).toBeInTheDocument();
    expect(screen.getByText("waiting 2 hr 15 min")).toBeInTheDocument();
    expect(screen.getByText("Owner not messaged yet")).toBeInTheDocument();
    expect(screen.getByText(/£42/)).toBeInTheDocument();
  });

  it("shows when the collection message went out", () => {
    render(<BookingStatusLine booking={{ ...readyBooking, collectionSentAt: "2026-07-02T10:05:00Z" }} />);
    expect(screen.getByText("Message sent 11:05")).toBeInTheDocument();
  });

  it("keeps collection facts off cards that aren't ready", () => {
    render(
      <BookingStatusLine
        booking={{ status: "Booked" }}
        waitMinutes={null}
        pay={{ kind: "due", label: "Balance due", amountDue: 55, depositPaid: 0, subtotal: 55 }}
      />,
    );
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.queryByText(/messaged|Message sent/)).not.toBeInTheDocument();
    expect(screen.getByText(/£55 due at pick-up/)).toBeInTheDocument();
  });
});

describe("AttentionPanel consolidated cards", () => {
  const resolve = (b) => ({ dogName: b.dogName, breed: "", owner: "Owner" });
  const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
  const dueOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });
  const handlers = {
    resolve,
    getWelfare,
    paymentOf: dueOf,
    onMarkArrived: () => {},
    onMarkCollected: () => {},
    onSendCollection: () => {},
    onMessageOwner: () => {},
    onMarkPaid: () => {},
    onDidntShow: () => {},
    onOpenBooking: () => {},
    onHideUntilTomorrow: () => {},
  };

  it("keeps Mark paid (with method) and Open on a waiting dog that owes", () => {
    const onMarkPaid = vi.fn();
    const item = {
      booking: { id: "r1", dogName: "Luna", slot: "09:00", status: "Ready for pick-up", collectionSentAt: null },
      kinds: ["ready", "payment"],
      primary: "ready",
      overdueMinutes: 0,
      waitMinutes: 20,
    };
    render(<AttentionPanel {...handlers} items={[item]} onMarkPaid={onMarkPaid} />);
    // Collection workflow leads; payment + open-booking survive consolidation.
    expect(screen.getByRole("button", { name: "Send collection message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    // Bare duration (headline already says "Waiting for collection").
    expect(screen.getByText("20 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    expect(onMarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), "card");
  });

  it("keeps the collection workflow on a ready dog whose primary is payment", () => {
    const onSendCollection = vi.fn();
    const item = {
      booking: { id: "r2", dogName: "Alfie", slot: "10:00", status: "Ready for pick-up", collectionSentAt: null },
      kinds: ["payment"],
      primary: "payment",
      overdueMinutes: 0,
      waitMinutes: 5,
    };
    render(<AttentionPanel {...handlers} items={[item]} onSendCollection={onSendCollection} />);
    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open booking" })).toBeInTheDocument();
    // Labelled wait — this headline doesn't say "waiting", so the fact must.
    expect(screen.getByText("waiting 5 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send collection message" }));
    expect(onSendCollection).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }));
  });
});
