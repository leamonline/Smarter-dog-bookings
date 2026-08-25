// Component tests for the Daily Brief's shared parts: the wait-time tones,
// the portalled More menu (with its full menu keyboard contract), the welfare
// chips' shared safety language, and the "Later" notes disclosure.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MoreMenu,
  WelfareChips,
  waitTone,
  WAIT_AMBER_MINUTES,
  WAIT_RED_MINUTES,
} from "./parts.jsx";
import { TodayBriefNotes } from "./TodayBriefNotes.jsx";

const unpaidState = { available: true, count: 2 };
const retentionState = { available: true, overdueCount: 3 };
vi.mock("../../../hooks/useUnpaidFortnight", () => ({
  useUnpaidFortnight: () => unpaidState,
}));
vi.mock("../../../hooks/useRetentionData", () => ({
  useRetentionData: () => retentionState,
}));

afterEach(() => {
  unpaidState.available = true;
  unpaidState.count = 2;
  retentionState.available = true;
  retentionState.overdueCount = 3;
});

describe("waitTone thresholds", () => {
  it("is neutral under the amber threshold, amber at 60+, red at 120+", () => {
    expect(waitTone(null)).toBe("neutral");
    expect(waitTone(0)).toBe("neutral");
    expect(waitTone(WAIT_AMBER_MINUTES - 1)).toBe("neutral");
    expect(waitTone(WAIT_AMBER_MINUTES)).toBe("amber");
    expect(waitTone(WAIT_RED_MINUTES - 1)).toBe("amber");
    expect(waitTone(WAIT_RED_MINUTES)).toBe("red");
    expect(waitTone(500)).toBe("red");
  });
});

describe("MoreMenu", () => {
  it("hides its items until opened, then fires the chosen one", () => {
    const onPick = vi.fn();
    render(
      <MoreMenu
        menuLabel="More actions for Max"
        items={[
          { label: "Open booking", onClick: onPick },
          { label: "Didn't show", onClick: vi.fn() },
        ]}
      />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "More actions for Max" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Open booking" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders through a portal so an ancestor's overflow can never clip it", () => {
    const { container } = render(
      <div style={{ overflow: "hidden", height: 10 }}>
        <MoreMenu menuLabel="More" items={[{ label: "Open booking", onClick: vi.fn() }]} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = screen.getByRole("menu");
    // The panel is a child of document.body, not of the clipping ancestor.
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it("keeps the full menu keyboard contract: focus in, arrows traverse, Escape restores", () => {
    render(
      <MoreMenu
        menuLabel="More actions for Max"
        items={[
          { label: "First", onClick: vi.fn() },
          { label: "Second", onClick: vi.fn() },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "More actions for Max" });
    fireEvent.click(trigger);
    const first = screen.getByRole("menuitem", { name: "First" });
    const second = screen.getByRole("menuitem", { name: "Second" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<MoreMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WelfareChips", () => {
  it("shows every welfare fact as its own always-visible coral safety chip", () => {
    render(
      <WelfareChips
        alerts={["Bites / Nips", "Muzzle required"]}
        pregnant
        notes="Nervous of dryers"
      />,
    );

    for (const text of ["Pregnant", "Bites / Nips", "Muzzle required", "Nervous of dryers"]) {
      const chip = screen.getByText(text).parentElement;
      // The shared safety language from SafetyAlertChip — coral, never amber,
      // and never hidden behind a tap.
      expect(chip.className).toMatch(/bg-brand-coral-light/);
      expect(chip.className).toMatch(/text-brand-coral-text/);
    }
  });

  it("renders nothing when there is nothing to flag", () => {
    const { container } = render(<WelfareChips alerts={[]} pregnant={false} notes="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TodayBriefNotes", () => {
  it("reports the correct count on Later and reveals both notes once opened", () => {
    render(<TodayBriefNotes todayStr="2026-07-14" onOpenReports={vi.fn()} />);

    expect(screen.getByText("Later")).toBeInTheDocument();
    expect(screen.getByText("2 things worth reviewing")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Later"));
    expect(screen.getByText(/2 grooms in the last fortnight/)).toBeInTheDocument();
    expect(screen.getByText(/3 dogs are due back with no booking/)).toBeInTheDocument();
  });

  it("uses singular copy for one note", () => {
    retentionState.available = false;
    render(<TodayBriefNotes todayStr="2026-07-14" onOpenReports={vi.fn()} />);
    expect(screen.getByText("1 thing worth reviewing")).toBeInTheDocument();
  });

  it("renders nothing when neither source is available (offline)", () => {
    unpaidState.available = false;
    retentionState.available = false;
    const { container } = render(<TodayBriefNotes todayStr="2026-07-14" onOpenReports={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides a zero-count note rather than saying zero", () => {
    unpaidState.count = 0;
    render(<TodayBriefNotes todayStr="2026-07-14" onOpenReports={vi.fn()} />);
    expect(screen.getByText("1 thing worth reviewing")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Later"));
    expect(screen.queryByText(/fortnight/)).not.toBeInTheDocument();
  });
});
