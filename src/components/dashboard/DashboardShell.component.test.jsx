import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./DashboardShell.jsx";

// The shell used to measure the left column with a ResizeObserver and cap the
// other two to whatever it found. These tests replace that contract: height
// now comes from the app shell through CSS, so there is nothing to measure,
// nothing to go stale, and no max-height at any width.
//
// jsdom performs no layout, so what is checkable here is the contract — which
// utilities are applied and at which breakpoint, and that no JavaScript sizing
// remains. That the columns actually reach the bottom of the window is a real
// layout question and is asserted in e2e/viewport-continuity.spec.ts.

function renderShell() {
  render(
    <DashboardShell
      left={<div>Week overview</div>}
      main={<div>Booking grid</div>}
      right={<div>Workflow</div>}
    />,
  );
  return {
    grid: screen.getByText("Booking grid").parentElement.parentElement,
    leftColumn: screen.getByText("Week overview").parentElement,
    middle: screen.getByText("Booking grid").parentElement,
    rightColumn: screen.getByText("Workflow").parentElement,
  };
}

describe("DashboardShell", () => {
  it("takes its height from the shell rather than measuring anything", () => {
    // If a ResizeObserver is ever constructed again, the sidebar-derived cap
    // has come back and the schedule will stop where the rail ends.
    const construct = vi.fn();
    class FailingResizeObserver {
      constructor() {
        construct();
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FailingResizeObserver);

    const { grid } = renderShell();

    expect(construct).not.toHaveBeenCalled();
    expect(grid.className).toContain("lg:h-full");
    expect(grid.className).toContain("lg:min-h-0");
    vi.unstubAllGlobals();
  });

  it("gives every column the fill contract, the sidebar included", () => {
    // The left rail used to define the row height; being a scroller like the
    // others is what stops a short window forcing everyone else short too.
    const { leftColumn, middle, rightColumn } = renderShell();

    for (const column of [leftColumn, middle, rightColumn]) {
      expect(column.className).toContain("lg:h-full");
      expect(column.className).toContain("lg:min-h-0");
    }
    expect(leftColumn.className).toContain("lg:overflow-y-auto");
    expect(rightColumn.className).toContain("lg:overflow-y-auto");
    expect(middle.className).toContain("lg:overflow-hidden");
  });

  it("sets no inline height on any column", () => {
    const { grid, leftColumn, middle, rightColumn } = renderShell();

    for (const el of [grid, leftColumn, middle, rightColumn]) {
      expect(el.style.height).toBe("");
      expect(el.style.maxHeight).toBe("");
      expect(el.style.getPropertyValue("--dashboard-row-height")).toBe("");
    }
  });

  it("scopes every height utility to the multi-column breakpoint (#834)", () => {
    // Below lg the left column is display:none and measures 0. That is what
    // made the old measured cap outlive its layout and clip the booking grid
    // on phones. An unscoped height utility would be the same mistake in CSS.
    const { grid, leftColumn, middle, rightColumn } = renderShell();

    for (const el of [grid, leftColumn, middle, rightColumn]) {
      for (const token of el.className.split(/\s+/).filter(Boolean)) {
        if (/^(h-|min-h-|max-h-|overflow-)/.test(token)) {
          throw new Error(`"${token}" is unscoped — it would apply below lg too`);
        }
      }
    }
  });

  it("stops pinning columns that nothing scrolls underneath any more", () => {
    const { leftColumn, middle, rightColumn } = renderShell();

    for (const column of [leftColumn, middle, rightColumn]) {
      expect(column.className).not.toContain("sticky");
    }
  });

  it("renders without the optional columns", () => {
    render(<DashboardShell main={<div>Booking grid</div>} />);

    expect(screen.getByText("Booking grid")).toBeInTheDocument();
    expect(screen.queryByText("Week overview")).not.toBeInTheDocument();
  });
});
