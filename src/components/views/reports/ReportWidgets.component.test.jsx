import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DetailedReportsDisclosure } from "./ReportWidgets.jsx";

describe("DetailedReportsDisclosure", () => {
  it("shows the overview and keeps detailed reports collapsed initially", () => {
    render(
      <DetailedReportsDisclosure>
        <p>Service mix report</p>
      </DetailedReportsDisclosure>,
    );

    expect(screen.getByRole("button", { name: "Show detailed reports" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Service mix report")).not.toBeInTheDocument();
  });

  it("reveals and hides detailed reports", async () => {
    const user = userEvent.setup();
    render(
      <DetailedReportsDisclosure>
        <p>Service mix report</p>
      </DetailedReportsDisclosure>,
    );

    const toggle = screen.getByRole("button", { name: "Show detailed reports" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Service mix report")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide detailed reports" }));
    expect(screen.queryByText("Service mix report")).not.toBeInTheDocument();
  });
});
