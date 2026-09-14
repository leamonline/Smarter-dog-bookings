// MobileNewBookingBar — the phone-only pinned "New booking" CTA of the Human
// card (Debt 7; pure move).
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileNewBookingBar } from "./MobileNewBookingBar.jsx";

describe("MobileNewBookingBar", () => {
  it("renders one New booking button that calls back on press", () => {
    const onNewBooking = vi.fn();
    render(<MobileNewBookingBar onNewBooking={onNewBooking} />);
    fireEvent.click(screen.getByRole("button", { name: "New booking" }));
    expect(onNewBooking).toHaveBeenCalledTimes(1);
  });
});
