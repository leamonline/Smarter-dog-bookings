// The collected summary at the foot of the stack.
//
// The figures themselves are unit-tested in src/engine/today.test.ts. This is
// about what the summary shows without a tap, and that the list under a total
// adds up to it.
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CollectedSummary } from "./CollectedSummary.jsx";
import { buildTakingsByMethod } from "../../../../engine/today";
import { buildCollectedRows } from "../../../../engine/dayStack";

const settled = (over) => ({
  service: "full-groom",
  size: "small",
  payment: "Paid in Full",
  ...over,
});

const DAY = [
  settled({ id: "a", dogName: "Bella", paymentMethod: "cash", paidAmount: 42, completedAt: "2026-07-14T09:00:00Z" }),
  settled({ id: "b", dogName: "Max", paymentMethod: "card", paidAmount: 38, completedAt: "2026-07-14T10:00:00Z" }),
  settled({ id: "c", dogName: "Luna", paymentMethod: "cash", paidAmount: 20, completedAt: "2026-07-14T11:00:00Z" }),
];

/** Collected, in the order they left — newest first, paid or not. */
function collectedNewestFirst(bookings) {
  return [...bookings].sort(
    (a, b) => Date.parse(b.completedAt || "") - Date.parse(a.completedAt || ""),
  );
}

function renderSummary(bookings = DAY) {
  const takings = buildTakingsByMethod(bookings);
  return render(
    <CollectedSummary
      takings={takings}
      rows={buildCollectedRows(collectedNewestFirst(bookings), takings)}
      resolve={(b) => ({ dogName: b.dogName, dogMissing: false, ownerMissing: true })}
    />,
  );
}

const summary = () => document.querySelector("[data-collected-summary] > summary");
const rows = () => [...document.querySelectorAll("[data-collected-row]")];

describe("the collected summary", () => {
  it("puts the running total on the closed row, so it needs no tap", () => {
    renderSummary();
    expect(document.querySelector("[data-collected-summary]").open).toBe(false);
    expect(summary()).toHaveTextContent("£100 · 3 dogs");
  });

  it("separates cash from card, which is what the till asks", () => {
    renderSummary();
    expect(screen.getByText("Cash").parentElement).toHaveTextContent("£62");
    expect(screen.getByText("Card").parentElement).toHaveTextContent("£38");
  });

  it("lists every collected dog, most recent first", () => {
    renderSummary();
    expect(rows().map((r) => r.textContent.replace(/\s+/g, " ").trim()))
      .toEqual(["Luna£20 cash", "Max£38 card", "Bella£42 cash"]);
  });

  it("lists amounts that add up to the total it sits under", () => {
    renderSummary();
    const listed = rows()
      .map((r) => Number(r.textContent.match(/£(\d+)/)[1]))
      .reduce((sum, n) => sum + n, 0);
    expect(summary()).toHaveTextContent(`£${listed} ·`);
  });

  it("says so plainly before anything has gone home", () => {
    renderSummary([]);
    expect(summary()).toHaveTextContent("£0 · 0 dogs");
    expect(screen.getByText("Nothing collected yet.")).toBeTruthy();
  });

  it("keeps one dog singular", () => {
    renderSummary([DAY[0]]);
    expect(summary()).toHaveTextContent("1 dog");
    expect(summary()).not.toHaveTextContent("1 dogs");
  });

  it("does not offer a split when there is only one method to show", () => {
    renderSummary([DAY[0]]);
    expect(screen.queryByText("Card")).toBeNull();
  });

  it("names a legacy payment with no recorded method rather than hiding it", () => {
    renderSummary([settled({ id: "x", dogName: "Rex", paidAmount: 30 })]);
    expect(within(rows()[0]).getByText("not recorded")).toBeTruthy();
  });
});

// The money-walks-out-the-door case (#878, finding 2).
//
// A dog handed back without paying used to appear nowhere on /today: it had
// left the stack, and the summary listed only what the takings had counted,
// which is Paid-in-Full rows. The test above this one has been called "lists
// every collected dog" since the day it was written and did not.
describe("a dog that went home without paying", () => {
  const WALKED = settled({
    id: "w",
    dogName: "Bramble",
    payment: "Due at Pick-up",
    paymentMethod: null,
    paidAmount: null,
    completedAt: "2026-07-14T12:00:00Z",
  });

  it("appears in the list at all", () => {
    renderSummary([...DAY, WALKED]);
    expect(screen.getByText("Bramble")).toBeTruthy();
  });

  it("says what is owed, in words, not just a figure", () => {
    renderSummary([...DAY, WALKED]);
    const row = rows().find((r) => r.textContent.includes("Bramble"));
    expect(within(row).getByText("owed")).toBeTruthy();
    expect(row.textContent).toContain("£42");
  });

  it("is marked as unsettled for anything reading the row, not only by colour", () => {
    renderSummary([...DAY, WALKED]);
    const row = rows().find((r) => r.textContent.includes("Bramble"));
    expect(row.getAttribute("data-settled")).toBe("false");
  });

  it("does not add its money to the till total", () => {
    renderSummary([...DAY, WALKED]);
    // £100 was taken. £42 is owed. The total is what is in the drawer.
    expect(summary()).toHaveTextContent("£100");
  });

  it("is visible on the closed row, because it is the thing worth chasing", () => {
    renderSummary([...DAY, WALKED]);
    // Nobody opens a summary to discover money is missing.
    expect(summary()).toHaveTextContent("£42 owed");
  });

  it("says nothing about owing when every dog paid", () => {
    renderSummary();
    expect(summary()).not.toHaveTextContent("owed");
  });
});
