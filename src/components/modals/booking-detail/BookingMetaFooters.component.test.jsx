import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BookingMetaFooters } from "./BookingMetaFooters.jsx";

describe("BookingMetaFooters — booked-by", () => {
  it("names the staff creator with a role qualifier and the date", () => {
    const { container } = render(
      <BookingMetaFooters
        booking={{
          createdByName: "Leam",
          createdByRole: "staff",
          createdAt: "2026-06-01T09:00:00Z",
        }}
      />,
    );
    expect(container.textContent).toContain("Booked by Leam (staff) on Mon 1 Jun");
  });

  it("names a customer creator with the customer qualifier", () => {
    const { container } = render(
      <BookingMetaFooters
        booking={{ createdByName: "Sarah Jones", createdByRole: "customer", createdAt: "2026-06-01T09:00:00Z" }}
      />,
    );
    expect(container.textContent).toContain("Booked by Sarah Jones (customer)");
  });

  it("omits the role qualifier for the AI (its name already reads as the actor)", () => {
    const { container } = render(
      <BookingMetaFooters
        booking={{ createdByName: "Smarter Dog AI", createdByRole: "ai", createdAt: "2026-06-01T09:00:00Z" }}
      />,
    );
    expect(container.textContent).toContain("Booked by Smarter Dog AI on");
    expect(container.textContent).not.toContain("(ai)");
  });

  it("renders nothing for a legacy row with no recorded creator", () => {
    const { container } = render(
      <BookingMetaFooters booking={{ createdByName: null }} />,
    );
    expect(container.textContent).not.toContain("Booked by");
  });
});
