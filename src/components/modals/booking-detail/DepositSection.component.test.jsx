import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DepositSection } from "./DepositSection.jsx";

const awaiting = {
  id: "b1",
  status: "Booked",
  payment: "Due at Pick-up",
  depositRequired: true,
  depositReference: "SDG-7K3M",
  depositDueBy: "2026-07-15T09:00:00Z",
  depositReceivedAt: null,
  depositAmount: 10,
};

describe("DepositSection", () => {
  it("shows reference + due time and fires mark-received", () => {
    const onMarkReceived = vi.fn();
    render(<DepositSection booking={awaiting} onMarkReceived={onMarkReceived} />);
    expect(screen.getByText("SDG-7K3M")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /deposit received/i }));
    expect(onMarkReceived).toHaveBeenCalled();
  });

  it("renders nothing when not awaiting", () => {
    const { container } = render(
      <DepositSection
        booking={{ ...awaiting, payment: "Deposit Paid" }}
        onMarkReceived={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an untagged booking", () => {
    const { container } = render(
      <DepositSection
        booking={{ ...awaiting, depositRequired: false }}
        onMarkReceived={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
