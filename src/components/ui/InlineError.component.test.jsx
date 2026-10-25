import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InlineError } from "./InlineError";

// The message sits on brand-coral-light (#FDE2E8). Plain brand-coral text is
// only 2.9:1 there; brand-coral-text (#B83A4F) is 4.58:1, which clears AA.
describe("InlineError", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<InlineError />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces the message and links it by id", () => {
    render(<InlineError id="phone-error" message="That phone number looks too short." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "phone-error");
    expect(alert).toHaveTextContent("That phone number looks too short.");
  });

  it("uses the readable coral for its text on the coral wash", () => {
    render(<InlineError message="Something is wrong." />);
    const cls = screen.getByRole("alert").className;
    expect(cls).toMatch(/(^|\s)bg-brand-coral-light(\s|$)/);
    expect(cls).toMatch(/(^|\s)text-brand-coral-text(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)text-brand-coral(\s|$)/);
  });
});
