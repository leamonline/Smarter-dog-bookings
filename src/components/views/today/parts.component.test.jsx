// Component tests for the "Later" notes disclosure, the one shared Daily Brief
// part the salon board did not replace. The wait-tone scale, the per-card More
// menu and the welfare chip row moved onto the token and its action panel, and
// are covered by src/engine/salonBoard.test.ts and salonBoard.component.test.jsx.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
