import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricBar } from "./MetricBar.jsx";

// Structure and content only. Whether the row physically fits its 188px card
// is a layout question, and jsdom performs no CSS layout — so that assertion
// lives in the browser suite (e2e/viewport-continuity.spec.ts), not here.

const track = (container) => container.querySelector(".h-2 > div");

describe("MetricBar", () => {
  it("puts the caption in its own element so it never competes with the value", () => {
    render(
      <MetricBar
        label="This week"
        value="64%"
        caption="36 of 56 seats booked this week"
        progress={64}
        progressClassName="bg-brand-teal"
      />,
    );

    // The old single-row layout forced these to share a flex line, which is
    // why the value cluster overflowed the card. They are now separate.
    const value = screen.getByText("64%");
    const caption = screen.getByText("36 of 56 seats booked this week");
    expect(value).toBeInTheDocument();
    expect(caption).toBeInTheDocument();
    expect(caption).not.toBe(value);
    expect(value.contains(caption)).toBe(false);
    expect(caption.contains(value)).toBe(false);
  });

  it("lets the caption wrap rather than truncating the measurement", () => {
    render(<MetricBar label="This week" value="64%" caption="36 of 56 seats booked this week" />);
    expect(screen.getByText("36 of 56 seats booked this week").className).not.toContain("truncate");
  });

  it("truncates the label, which is the expendable half of the row", () => {
    render(<MetricBar label="This day" subLabel="Mon 21 Sep" value="100%" />);
    expect(screen.getByText(/This day/).className).toContain("truncate");
  });

  it("clamps the drawn track to 0-100 without altering the caller's figure", () => {
    const { container } = render(
      <MetricBar label="This week" value="£1768 (142%)" progress={142} progressClassName="bg-emerald-500" />,
    );
    expect(track(container).style.width).toBe("100%");
    // The figure is the caller's to tell the truth about.
    expect(screen.getByText("£1768 (142%)")).toBeInTheDocument();
  });

  it("renders an empty track when there is no progress to show", () => {
    const { container } = render(<MetricBar label="This day" value="closed" progress={null} />);
    expect(track(container)).toBeNull();
  });

  it("omits the caption element entirely when there is nothing true to say", () => {
    const { container } = render(<MetricBar label="This day" value="£0" caption={null} />);
    expect(container.querySelector(".text-caption")).toBeNull();
  });

  it("marks the row busy while loading so assistive tech does not read a stale figure", () => {
    const { container } = render(<MetricBar label="This week" value="—" loading />);
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");
  });
});
