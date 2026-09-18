import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BookingHealth } from "./BookingHealth.jsx";
import { BOOKING_STATUS } from "../../../constants/salon";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderHealth(props = {}) {
  render(
    <MemoryRouter initialEntries={["/reports/insights"]}>
      <Routes>
        <Route
          path="/reports/insights"
          element={
            <BookingHealth
              statusAcc={{ [BOOKING_STATUS.READY_FOR_COLLECTION]: 8, [BOOKING_STATUS.BOOKED]: 2 }}
              totalPast={10}
              noShowN={1}
              noShowRate={9.090909}
              noShowDenom={11}
              needsClassificationN={2}
              prevNoShowRate={0}
              insight=""
              {...props}
            />
          }
        />
        <Route path="/needs-attention" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BookingHealth", () => {
  it("labels the no-show figure as confirmed, never as plain 'no-show'", () => {
    renderHealth();

    expect(screen.getByText(/confirmed no-shows?/i)).toBeInTheDocument();
    // The old copy inferred an absence from an unclosed booking.
    expect(screen.queryByText(/Booked \/ No-show/i)).not.toBeInTheDocument();
  });

  it("shows the confirmed rate over appointments that reached their slot", () => {
    renderHealth();

    expect(screen.getByText("9%")).toBeInTheDocument();
    // "1/11 kept" read as though one appointment was kept, when 1 is the
    // no-show count — the caption must say what the numerator counts.
    expect(screen.getByText(/1 of 11 dogs due in/i)).toBeInTheDocument();
    expect(screen.queryByText(/kept/i)).not.toBeInTheDocument();
  });

  it("explains the denominator, so the basis needs no reverse engineering", () => {
    renderHealth();

    const note = screen.getByText(/cancelled ahead of time/i);
    expect(note).toBeInTheDocument();
    expect(note.textContent).toMatch(/counted either way/i);
    expect(note.textContent).toMatch(/out of the dogs due in/i);
  });

  it("reports unclassified past bookings separately from no-shows", () => {
    renderHealth();

    const review = screen.getByRole("button", { name: /review 2 unclassified bookings/i });
    expect(review).toBeInTheDocument();
  });

  it("sends the reviewer to the Needs Attention view", async () => {
    renderHealth();

    await userEvent.click(
      screen.getByRole("button", { name: /review 2 unclassified bookings/i }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/needs-attention");
  });

  it("hides the review prompt when nothing needs classifying", () => {
    renderHealth({ needsClassificationN: 0, statusAcc: { [BOOKING_STATUS.READY_FOR_COLLECTION]: 10 } });

    expect(screen.queryByRole("button", { name: /unclassified/i })).not.toBeInTheDocument();
  });

  it("uses singular wording for a single unclassified booking", () => {
    renderHealth({ needsClassificationN: 1 });

    expect(
      screen.getByRole("button", { name: /review 1 unclassified booking$/i }),
    ).toBeInTheDocument();
  });

  it("labels a past Booked segment as needing classification, not as a no-show", () => {
    renderHealth();

    expect(screen.getByText(/needs classification/i)).toBeInTheDocument();
  });
});
