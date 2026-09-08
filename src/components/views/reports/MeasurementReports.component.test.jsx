import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelReport } from "./FunnelReport.jsx";
import { CapacityPreventedReport } from "./CapacityPreventedReport.jsx";
import { computeFunnelStats } from "../../../engine/funnel";
import { computeDenialStats } from "../../../engine/denials";
const mocks = vi.hoisted(() => ({ funnel: vi.fn(), denials: vi.fn() }));
vi.mock("../../../hooks/useFunnelData.ts", () => ({ useFunnelData: mocks.funnel }));
vi.mock("../../../hooks/useDenialsData.ts", () => ({ useDenialsData: mocks.denials }));
vi.mock("./ReportWidgets.jsx", () => ({ Section: ({ title, insight, children }) => <section><h2>{title}</h2><p>{insight}</p>{children}</section> }));

describe("measurement interpretation", () => {
  it("shows orphan sessions even when there is no completion denominator", () => {
    mocks.funnel.mockReturnValue({ loading: false, available: true, stats: computeFunnelStats([{ session_id: "orphan", step: "booked", created_at: new Date().toISOString() }], 7) });
    render(<FunnelReport days={7} />);
    expect(screen.getByText(/No booking attempts with a recorded start/)).toBeInTheDocument();
    expect(screen.getByText(/1 sessions without a recorded start excluded/)).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });
  it("does not call attempts customers or unfinished attempts abandoned", () => {
    const created_at = new Date().toISOString();
    mocks.funnel.mockReturnValue({ loading: false, available: true, stats: computeFunnelStats(["started", "booked"].map(step => ({ session_id: "s", step, created_at })), 7) });
    render(<FunnelReport days={7} />);
    expect(screen.getByText(/100% of the 1 recorded booking attempts/)).toBeInTheDocument();
    expect(screen.getByText(/not proof of abandonment/)).toBeInTheDocument();
    expect(screen.getByText(/1 sessions with missing intermediate steps/)).toBeInTheDocument();
  });
  it("never interprets zero denials as universal success", () => {
    mocks.denials.mockReturnValue({ loading: false, available: true, stats: computeDenialStats([], 7) });
    render(<CapacityPreventedReport days={7} />);
    expect(screen.getByText(/does not prove every attempt succeeded/)).toBeInTheDocument();
  });
  it("hides previous-period values while loading", () => {
    mocks.funnel.mockReturnValue({ loading: true, available: true, stats: computeFunnelStats([], 7) });
    mocks.denials.mockReturnValue({ loading: true, available: true, stats: computeDenialStats([], 7) });
    render(<><FunnelReport days={7} /><CapacityPreventedReport days={7} /></>);
    expect(screen.getByText(/Loading the booking funnel/)).toBeInTheDocument();
    expect(screen.getByText(/Checking for turned-away bookings/)).toBeInTheDocument();
  });
});
