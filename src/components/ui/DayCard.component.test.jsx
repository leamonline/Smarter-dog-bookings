// DayCard is presentational: every state it must survive, drawn from props.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DayCard } from "./DayCard.jsx";
import { resolveDayStatus } from "./BookingStatusBadge";

const STATUSES = ["Booked", "Arrived", "In progress", "Ready", "Completed", "No-show"];

const base = (over = {}) => {
  const status = over.status ?? "Booked";
  return {
    id: "b1",
    status,
    tone: resolveDayStatus(status, null),
    time: "09:00",
    dogName: "Biscuit",
    ownerName: "Sam Lee",
    subtitle: "Full Groom · Cockapoo",
    timing: "Due in 10 min",
    expanded: false,
    onToggle: () => {},
    ...over,
  };
};

const renderCard = (props) =>
  render(
    <ul>
      <DayCard {...base(props)}>
        <p>drawer contents</p>
      </DayCard>
    </ul>,
  );

describe("DayCard states", () => {
  it.each(STATUSES)("renders the %s status as a word", (status) => {
    const { container } = renderCard({ status });
    const tone = resolveDayStatus(status, null);
    expect(container.querySelector("[data-stack-head]").getAttribute("aria-label")).toContain(tone.label);
    expect(container.querySelector("[data-status-key]").dataset.statusKey).toBe(tone.key);
  });

  it("shows the balance as bold figures with the word due", () => {
    renderCard({ status: "Ready", balance: { kind: "due", text: "£38.00" } });
    expect(screen.getByText("£38.00 due")).toBeTruthy();
  });

  it("says Paid, and says when payment is not known, in words", () => {
    const { unmount } = renderCard({ status: "Ready", balance: { kind: "paid" } });
    expect(screen.getByText("Paid")).toBeTruthy();
    unmount();
    renderCard({ status: "Ready", balance: { kind: "unknown" } });
    expect(screen.getByText("Payment not known")).toBeTruthy();
  });

  it("shows up to two warnings as words, one per line, in a 44px target", () => {
    const { container } = renderCard({ safetyFacts: ["Bites / Nips", "Pregnant"] });
    const summary = container.querySelector("[data-safety-summary]");
    expect(summary.className).toContain("min-h-touch-target");
    expect(summary.dataset.safetyReview).toBe("false");
    expect(screen.getByText("Bites / Nips")).toBeTruthy();
    expect(screen.getByText("Pregnant")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Safety alert: Bites / Nips, Pregnant" })).toBeTruthy();
  });

  it("asks for a review, with the real count, when there are more than two", () => {
    const { container } = renderCard({ safetyFacts: ["Bites / Nips", "Reactive to dogs", "Fear of dryer", "Sensitive paws"] });
    const summary = container.querySelector("[data-safety-summary]");
    expect(summary.dataset.safetyReview).toBe("true");
    expect(summary.textContent).toContain("Review safety instructions before handling · 4 alerts");
    // Every warning is still named for assistive technology.
    expect(summary.getAttribute("aria-label")).toBe(
      "Safety alert: Bites / Nips, Reactive to dogs, Fear of dryer, Sensitive paws",
    );
  });

  it("keeps the safety area inside the fixed header, whatever it holds", () => {
    const { container } = renderCard({ safetyFacts: ["a", "b", "c"], undelivered: { chip: "Message not delivered", detail: "x" } });
    expect(container.querySelector(".wallet-header").children).toHaveLength(3);
  });

  it("lets safety keep the width: beside a safety note the delivery problem is an icon with its full name", () => {
    const { container } = renderCard({
      safetyFacts: ["Bites / Nips"],
      undelivered: { chip: "Message not delivered", detail: "Phone them." },
    });
    const undelivered = container.querySelector("[data-undelivered]");
    expect(undelivered.textContent).toBe("");
    expect(undelivered.getAttribute("aria-label")).toBe("Message not delivered. Phone them.");
    expect(undelivered.className).toContain("w-touch-target");
    expect(container.querySelector("[data-safety-summary]")).toBeTruthy();
  });

  it("shows an undeliverable message in the safety row", () => {
    const { container } = renderCard({ undelivered: { chip: "Message not delivered", detail: "Phone them." } });
    const row = container.querySelector(".wallet-safety");
    expect(row.querySelector("[data-undelivered]")).toBeTruthy();
    expect(row.textContent).toContain("Message not delivered");
  });

  it("marks urgency by weight and wording, and widens the left rule", () => {
    const { container } = renderCard({ urgent: true, timing: "Running late" });
    const card = container.querySelector("[data-stack-card]");
    expect(card.dataset.urgent).toBe("true");
    expect(card.style.borderLeftWidth).toBe("10px");
    expect(screen.getByText("Running late").closest("span").parentElement.className).toContain("font-bold");
  });

  it("uses the widest rule for a dog left in Ready too long", () => {
    const { container } = renderCard({ status: "Ready", readyOverdue: true, urgent: true });
    expect(container.querySelector("[data-stack-card]").style.borderLeftWidth).toBe("14px");
  });

  it("keeps the visible heading together before extra spoken context", () => {
    const { container } = renderCard({ status: "Ready for collection", balance: { kind: "paid" } });
    expect(container.querySelector("[data-stack-head]")).toHaveAccessibleName(
      /^09:00[. ]+Biscuit[. ]+Ready[. ]+Paid[. ]+Full Groom/,
    );
  });

  it("names the whole card in one accessible sentence", () => {
    const { container } = renderCard({ onTheWay: true, safetyFacts: ["Bites"] });
    const label = container.querySelector("[data-stack-head]").getAttribute("aria-label");
    expect(label).toContain("09:00");
    expect(label).toContain("Biscuit");
    expect(label).toContain("Owner on the way");
    expect(label).toContain("Safety note: Bites");
  });

  it("makes the closed drawer inert and the open one reachable", () => {
    const { container, rerender } = renderCard({ expanded: false });
    expect(container.querySelector("#stack-drawer-b1 > div").hasAttribute("inert")).toBe(true);
    rerender(
      <ul>
        <DayCard {...base({ expanded: true })}>
          <p>drawer contents</p>
        </DayCard>
      </ul>,
    );
    expect(container.querySelector("#stack-drawer-b1 > div").hasAttribute("inert")).toBe(false);
  });

  it("toggles from the head, from blank header space, and only opens from a chip", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = renderCard({ onToggle, safetyFacts: ["Bites"], expanded: true });
    await user.click(container.querySelector("[data-stack-head]"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    await user.click(container.querySelector("[data-stack-header]"));
    expect(onToggle).toHaveBeenCalledTimes(2);
    // Already open: the safety chip must not collapse it.
    await user.click(screen.getByRole("button", { name: /Safety alert/ }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});

describe("DayCard header zones", () => {
  it("draws the same three zones in every state, so no state adds a row", () => {
    const states = [
      {},
      { status: "Ready", balance: { kind: "due", text: "£38.00" } },
      { safetyFacts: ["Bites"] },
      { undelivered: { chip: "Message not delivered", detail: "Phone them." } },
      { safetyFacts: ["Bites"], undelivered: { chip: "Message not delivered", detail: "x" }, onTheWay: true },
    ];
    for (const state of states) {
      const { container, unmount } = renderCard(state);
      const header = container.querySelector(".wallet-header");
      expect([...header.children].map((c) => c.className.split(" ")[0])).toEqual([
        "wallet-heading",
        "wallet-metadata",
        "wallet-safety",
      ]);
      unmount();
    }
  });
});
