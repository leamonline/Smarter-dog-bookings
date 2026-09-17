import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClosureCard } from "./ClosureCard.jsx";

const closure = {
  id: "c1",
  from: "09:00",
  to: "10:30",
  reason: "doctor's appointment",
};
const slots = ["09:00", "09:30", "10:00"];

describe("ClosureCard", () => {
  it("shows the reason verbatim after 'Closed for'", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.getByText("Closed for doctor's appointment")).toBeInTheDocument();
  });

  it("shows the range and the slot count", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.getByText(/9:00 – 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/3 slots/)).toBeInTheDocument();
  });

  it("says '1 slot' for a single covered slot", () => {
    render(<ClosureCard closure={{ ...closure, to: "09:30" }} slots={["09:00"]} />);
    expect(screen.getByText(/1 slot(?!s)/)).toBeInTheDocument();
  });

  it("offers reopen and edit from the actions menu", async () => {
    const onReopen = vi.fn();
    const onEditReason = vi.fn();
    render(
      <ClosureCard closure={closure} slots={slots} onReopen={onReopen} onEditReason={onEditReason} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /closure actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /reopen these times/i }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("hides the actions trigger when no handlers are given", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.queryByRole("button", { name: /closure actions/i })).toBeNull();
  });

  it("renders clashing bookings passed as children", () => {
    render(
      <ClosureCard closure={closure} slots={slots}>
        <p>Bella — Full Groom</p>
      </ClosureCard>,
    );
    expect(screen.getByText("Bella — Full Groom")).toBeInTheDocument();
  });
});
