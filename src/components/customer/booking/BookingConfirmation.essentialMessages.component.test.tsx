import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingConfirmation } from "./BookingConfirmation";
import { ESSENTIAL_MESSAGES_NOTICE } from "../../../constants/salonPolicies";

// Customers are told, at the moment they book, that essential messages are part
// of booking, that WhatsApp is used where possible with a text otherwise, and
// that promotions are separate (owner's wording, 22 November 2026).
describe("BookingConfirmation essential-messages notice", () => {
  it("explains the messaging requirement before the customer confirms", () => {
    render(
      <BookingConfirmation
        selectedDogs={[]}
        services={{}}
        selectedDate={null}
        slotAllocation={null}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
        dogs={[]}
      />,
    );
    const notice = screen.getByTestId("essential-messages-notice");
    expect(notice).toHaveTextContent(ESSENTIAL_MESSAGES_NOTICE);
    expect(notice).toHaveTextContent(/confirmations, booking updates, and a message when your dog is ready to come home/i);
    expect(notice).toHaveTextContent(/WhatsApp where possible or send you a text if preferred/i);
    expect(notice).toHaveTextContent(/only send you offers or promotions if you.ve said you.d like them/i);
    expect(screen.getByRole("heading", { name: "We\u2019ll keep you in the loop!" })).toBeInTheDocument();
  });

  it("keeps the word cancel out of the messages notice", () => {
    // The confirm step may mention cancelling only when the server supplied a policy.
    expect(ESSENTIAL_MESSAGES_NOTICE).not.toMatch(/cancel/i);
  });
});
