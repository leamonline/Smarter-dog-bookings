// DayCard is presentational: every state it must survive, drawn from props.
// The strip is 72px and holds everything essential in two lines; the face is
// read-only; the full view is reachable only when the card is lifted.
import { fireEvent, render, screen } from "@testing-library/react";
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
    ownerSurname: "Lee",
    subtitle: "Cockapoo · Full Groom",
    timing: "in 10 min",
    lifted: false,
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

  it("renders Unconfirmed as an inverted pill that reads as needing attention", () => {
    const tone = resolveDayStatus("Booked", null, "unconfirmed");
    const { container } = renderCard({ tone, confirmation: "unconfirmed" });
    const pill = container.querySelector("[data-status-variant='pill']");
    expect(pill.textContent).toBe("Unconfirmed");
    expect(pill.dataset.needsAttention).toBe("true");
    expect(container.querySelector("[data-stack-card]").dataset.statusKey).toBe("unconfirmed");
  });

  it("shows the balance as bold figures with the word due, on the first line", () => {
    const { container } = renderCard({ status: "Ready", balance: { kind: "due", text: "£38" } });
    const balance = container.querySelector(".wallet-line-1 [data-stack-balance]");
    expect(balance).toHaveTextContent("£38 due");
    expect(balance.className).toContain("font-bold");
  });

  it("says Paid, and says when payment is not known, in words", () => {
    const { unmount } = renderCard({ status: "Ready", balance: { kind: "paid" } });
    expect(screen.getByText("Paid")).toBeTruthy();
    unmount();
    renderCard({ status: "Ready", balance: { kind: "unknown" } });
    expect(screen.getByText("Payment not known")).toBeTruthy();
  });

  it("puts breed, service and the owner's surname on line two", () => {
    const { container } = renderCard();
    expect(container.querySelector(".wallet-line-2 [data-stack-subtitle]")).toHaveTextContent("Cockapoo · Full Groom · Lee");
  });

  it("leads line two with the safety note, in words, and counts the others", () => {
    const { container } = renderCard({ safetyFacts: ["Bites / Nips", "Pregnant", "Muzzle"] });
    const safety = container.querySelector(".wallet-line-2 [data-stack-safety]");
    expect(safety).toHaveTextContent("Bites / Nips +2");
    expect(safety.closest("[data-stack-meta]").firstElementChild).toBe(safety);
  });

  it("shows an undeliverable message on line two, after any safety note", () => {
    const { container } = renderCard({
      safetyFacts: ["Bites"],
      undelivered: { chip: "Message not delivered", detail: "Phone them." },
    });
    const meta = container.querySelector("[data-stack-meta]");
    expect([...meta.children].map((el) => Object.keys(el.dataset)[0])).toEqual([
      "stackSafety",
      "undelivered",
      "stackSubtitle",
    ]);
    expect(meta.querySelector("[data-undelivered]").textContent).toBe("Message not delivered");
  });

  it("marks urgency by weight and wording, and widens the left rule", () => {
    const { container } = renderCard({ urgent: true, timing: "15 min late" });
    const card = container.querySelector("[data-stack-card]");
    expect(card.dataset.urgent).toBe("true");
    expect(card.style.borderLeftWidth).toBe("10px");
    expect(container.querySelector("[data-stack-timing]").className).toContain("font-bold");
  });

  it("marks the one countdown, and draws it in the card's ink", () => {
    const { container } = renderCard({ timing: "in 27 min", countdown: true });
    const timing = container.querySelector("[data-stack-timing]");
    expect(timing.dataset.countdown).toBe("true");
    expect(timing).toHaveTextContent("in 27 min");
  });

  it("keeps timing and the on-the-way signal in the strip", () => {
    const { container } = renderCard({ timing: "waiting 50 min", onTheWay: true });
    const timing = container.querySelector("[data-stack-head] [data-stack-timing]");
    expect(timing).toHaveTextContent("waiting 50 min");
    expect(timing).toHaveTextContent("On the way");
  });

  it("draws no timing when there is nothing to time", () => {
    const { container } = renderCard({ timing: undefined });
    expect(container.querySelector("[data-stack-timing]")).toBeNull();
  });

  it("uses the widest rule for a dog left in Ready too long", () => {
    const { container } = renderCard({ status: "Ready", readyOverdue: true, urgent: true });
    expect(container.querySelector("[data-stack-card]").style.borderLeftWidth).toBe("14px");
  });

  it("speaks the strip's visible words first and in order (label in name)", () => {
    const { container } = renderCard({
      status: "Ready for collection",
      tone: resolveDayStatus("Ready for collection", null),
      balance: { kind: "paid" },
      safetyFacts: ["Bites"],
      onTheWay: true,
    });
    const head = container.querySelector("[data-stack-head]");
    const label = head.getAttribute("aria-label");
    expect(label.startsWith("09:00. Biscuit. Paid. Ready. Bites. Cockapoo · Full Groom · Lee. in 10 min. On the way")).toBe(true);
    // Extra context after: every safety note in full, and the owner's whole name.
    expect(label).toContain("On the way. Safety note: Bites");
    expect(label).toContain("owner Sam Lee");
    // The check axe makes (label-content-name-mismatch): the visible text, with
    // punctuation dropped and spaces collapsed, is one run inside the name.
    const curate = (text) => text.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
    expect(curate(label)).toContain(curate(head.textContent));
  });

  it("keeps the visible text one run inside the name, whatever the strip holds", () => {
    const states = [
      {},
      { status: "Ready", balance: { kind: "due", text: "£38" }, timing: "waiting 50 min", onTheWay: true },
      { safetyFacts: ["Bites / Nips", "Pregnant"] },
      { safetyFacts: ["Bites"], undelivered: { chip: "Reminder not delivered", detail: "x" } },
      { timing: undefined, ownerSurname: "" },
    ];
    const curate = (text) => text.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
    for (const state of states) {
      const { container, unmount } = renderCard(state);
      const head = container.querySelector("[data-stack-head]");
      expect(curate(head.getAttribute("aria-label"))).toContain(curate(head.textContent));
      unmount();
    }
  });

  it("keeps the face read-only and out of the accessibility tree, and drops it when lifted", () => {
    const { container, rerender } = renderCard({ face: "Check ears." });
    const face = container.querySelector("[data-stack-face]");
    expect(face).toHaveTextContent("Check ears.");
    expect(face.getAttribute("aria-hidden")).toBe("true");
    rerender(
      <ul>
        <DayCard {...base({ face: "Check ears.", lifted: true })}>
          <p>drawer contents</p>
        </DayCard>
      </ul>,
    );
    expect(container.querySelector("[data-stack-face]")).toBeNull();
  });

  it("makes the full view inert until the card is lifted, then a labelled region with a Close button", () => {
    const onClose = vi.fn();
    const { container, rerender } = renderCard({ lifted: false, onClose });
    expect(container.querySelector("#stack-drawer-b1 > div").hasAttribute("inert")).toBe(true);
    rerender(
      <ul>
        <DayCard {...base({ lifted: true, onClose })}>
          <p>drawer contents</p>
        </DayCard>
      </ul>,
    );
    expect(container.querySelector("#stack-drawer-b1 > div").hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("region", { name: "Biscuit — details" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close Biscuit" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("makes a card in the pile inert as a whole", () => {
    const { container } = renderCard({ inPile: true, clip: 8 });
    const card = container.querySelector("[data-stack-card]");
    expect(card.hasAttribute("inert")).toBe(true);
    expect(card.style.clipPath).toBe("inset(0 0 calc(100% - 8px) 0)");
  });

  it("toggles from the strip, which is the only control outside the full view", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { container } = renderCard({
      onToggle,
      safetyFacts: ["Bites"],
      undelivered: { chip: "Message not delivered", detail: "x" },
    });
    await user.click(container.querySelector("[data-stack-safety]"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    const controls = [...container.querySelectorAll("button")]
      .filter((el) => !el.closest("[data-stack-details]"));
    expect(controls).toHaveLength(1);
    expect(controls[0].getAttribute("aria-expanded")).toBe("false");
  });
});

describe("DayCard strip", () => {
  it("draws the same two lines in every state, so no state adds a row", () => {
    const states = [
      {},
      { status: "Ready", balance: { kind: "due", text: "£38" } },
      { safetyFacts: ["Bites"] },
      { undelivered: { chip: "Message not delivered", detail: "Phone them." } },
      { safetyFacts: ["Bites"], undelivered: { chip: "Message not delivered", detail: "x" }, onTheWay: true },
    ];
    for (const state of states) {
      const { container, unmount } = renderCard(state);
      const strip = container.querySelector("[data-stack-head]");
      expect([...strip.children].map((c) => c.className.split(" ").slice(0, 2).join(" "))).toEqual([
        "wallet-line wallet-line-1",
        "wallet-line wallet-line-2",
      ]);
      unmount();
    }
  });
});
