import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardShell } from "./DashboardShell.jsx";

const MATCHED_HEIGHT_CLASS = "lg:max-h-[var(--dashboard-row-height,none)]";

// jsdom has no ResizeObserver, so stand one in and drive the left column's
// measurement by hand.
function installResizeObserver() {
  const state = { callbacks: [], disconnected: 0 };
  class StubResizeObserver {
    constructor(callback) {
      state.callbacks.push(callback);
    }

    observe() {}

    disconnect() {
      state.disconnected += 1;
    }
  }
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  state.measure = (height) => {
    act(() => {
      for (const callback of state.callbacks) {
        callback([{ contentRect: { height } }], null);
      }
    });
  };
  return state;
}

function renderShell() {
  render(
    <DashboardShell
      left={<div>Week overview</div>}
      main={<div>Booking grid</div>}
      right={<div>Workflow</div>}
    />,
  );
  return {
    middle: screen.getByText("Booking grid").parentElement,
    rightColumn: screen.getByText("Workflow").parentElement,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardShell", () => {
  it("publishes the measured sidebar height as a breakpoint-scoped custom property", () => {
    const observer = installResizeObserver();
    const { middle, rightColumn } = renderShell();

    observer.measure(742);

    for (const column of [middle, rightColumn]) {
      expect(column.style.getPropertyValue("--dashboard-row-height")).toBe("742px");
      expect(column.className).toContain(MATCHED_HEIGHT_CLASS);
      // The cap belongs to the multi-column layout that produced it. An inline
      // max-height would apply at every width, including the single-column
      // layout where the sidebar it was measured from is display:none.
      expect(column.style.maxHeight).toBe("");
    }
  });

  it("never caps a column before the sidebar has been measured", () => {
    installResizeObserver();
    const { middle, rightColumn } = renderShell();

    for (const column of [middle, rightColumn]) {
      expect(column.style.getPropertyValue("--dashboard-row-height")).toBe("");
      expect(column.style.maxHeight).toBe("");
    }
  });

  it("holds the last real measurement when the hidden sidebar reports zero", () => {
    // Below lg the sidebar is display:none and measures 0. Adopting that would
    // collapse the columns; the CSS scoping is what keeps the stale figure from
    // reaching a layout it does not describe.
    const observer = installResizeObserver();
    const { middle } = renderShell();

    observer.measure(742);
    observer.measure(0);

    expect(middle.style.getPropertyValue("--dashboard-row-height")).toBe("742px");
    expect(middle.style.maxHeight).toBe("");
  });

  it("disconnects its observer on unmount", () => {
    const observer = installResizeObserver();
    const { unmount } = render(<DashboardShell left={<div>L</div>} main={<div>M</div>} />);

    unmount();

    expect(observer.disconnected).toBe(1);
  });
});
