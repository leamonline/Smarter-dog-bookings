// Tests for the shared Today primitives: the canonical status line, honest
// wait-time colours (threshold-driven, never green, never from the section a
// card sits in), and the card-level "More" menu.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  BookingStatusLine,
  WaitBadge,
  waitTone,
  MoreMenu,
  WAIT_AMBER_MINUTES,
  WAIT_RED_MINUTES,
} from "./parts.jsx";
import { TodayKpiRow } from "./TodayKpiRow.jsx";

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

  it("shows status + since-time, wait and payment in order", () => {
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
    expect(screen.getByText(/£42/)).toBeInTheDocument();
  });

  it("never restates whether the collection message went out — the primary action already carries that fact", () => {
    render(<BookingStatusLine booking={{ ...readyBooking, collectionSentAt: "2026-07-02T10:05:00Z" }} />);
    expect(screen.queryByText(/messaged|Message sent/)).not.toBeInTheDocument();
  });

  it("shows the £ balance for a non-ready booking too", () => {
    render(
      <BookingStatusLine
        booking={{ status: "Booked" }}
        waitMinutes={null}
        pay={{ kind: "due", label: "Balance due", amountDue: 55, depositPaid: 0, subtotal: 55 }}
      />,
    );
    expect(screen.getByText(/£55 due at pick-up/)).toBeInTheDocument();
  });

  it("suppresses the 'Booked' pill — the default resting state adds no information — but keeps it for every other status", () => {
    const { rerender } = render(<BookingStatusLine booking={{ status: "Booked" }} />);
    expect(screen.queryByText("Booked")).not.toBeInTheDocument();

    rerender(<BookingStatusLine booking={{}} />);
    expect(screen.queryByText("Booked")).not.toBeInTheDocument();

    rerender(<BookingStatusLine booking={{ status: "Checked in" }} />);
    expect(screen.getByText("Checked in")).toBeInTheDocument();

    rerender(<BookingStatusLine booking={{ status: "Completed" }} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});

describe("MoreMenu", () => {
  it("hides its items until opened, then fires the chosen one", () => {
    const onA = vi.fn();
    render(
      <MoreMenu
        menuLabel="More actions for Rex"
        items={[
          { label: "Open booking", onClick: onA },
          { label: "Didn't show", onClick: noop },
        ]}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "Open booking" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Rex" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open booking" }));
    expect(onA).toHaveBeenCalled();
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<MoreMenu items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("TodayKpiRow", () => {
  it("shows dogs in, expected revenue and capacity from the same count", () => {
    render(<TodayKpiRow dogsBooked={11} expectedRevenue={478.4} />);
    expect(screen.getByText("Dogs in").parentElement).toHaveTextContent("11");
    expect(screen.getByText("£478")).toBeInTheDocument();
    expect(screen.getByText("if all paid")).toBeInTheDocument();
    expect(screen.getByText(/\/ 14/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: /capacity/i });
    expect(bar).toHaveAttribute("aria-valuenow", "11");
    expect(bar).toHaveAttribute("aria-valuemax", "14");
  });

  it("caps the bar at 100% when over capacity", () => {
    render(<TodayKpiRow dogsBooked={20} expectedRevenue={0} />);
    const bar = screen.getByRole("progressbar", { name: /capacity/i });
    expect(bar.querySelector("span").style.width).toBe("100%");
  });
});

function noop() {}
