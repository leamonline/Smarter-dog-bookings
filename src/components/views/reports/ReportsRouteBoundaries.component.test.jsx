import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CashUpView } from "./CashUpView.jsx";
import { ReportsInsightsView } from "./ReportsInsightsView.jsx";

const { mockUseReportsData, mockWeeklyCashUp } = vi.hoisted(() => ({
  mockUseReportsData: vi.fn(),
  mockWeeklyCashUp: vi.fn(() => <div>Weekly cash-up body</div>),
}));

vi.mock("../../../hooks/useReportsData.ts", () => ({
  useReportsData: mockUseReportsData,
}));
vi.mock("../../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));
vi.mock("../../../contexts/SalonContext", () => ({
  useSalon: () => ({ bookingsByDate: {}, dogs: {}, humans: {} }),
}));
vi.mock("./WeeklyCashUp.jsx", () => ({
  WeeklyCashUp: mockWeeklyCashUp,
}));

describe("report route data boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReportsData.mockReturnValue({
      loading: true,
      stats: { curN: 0 },
      chartLabels: [],
      insights: {},
      analytics: {},
    });
  });

  it("does not initialise analytics on the Cash-up route", () => {
    render(<CashUpView />);

    expect(mockWeeklyCashUp).toHaveBeenCalledOnce();
    expect(mockUseReportsData).not.toHaveBeenCalled();
  });

  it("does not mount WeeklyCashUp on the Insights route", () => {
    render(
      <MemoryRouter initialEntries={["/reports/insights?period=90"]}>
        <ReportsInsightsView />
      </MemoryRouter>,
    );

    expect(mockUseReportsData).toHaveBeenCalledOnce();
    expect(mockWeeklyCashUp).not.toHaveBeenCalled();
  });
});
