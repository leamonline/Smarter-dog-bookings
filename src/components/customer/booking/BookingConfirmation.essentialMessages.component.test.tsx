import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingConfirmation } from "./BookingConfirmation";
import { ESSENTIAL_MESSAGES_NOTICE } from "../../../constants/salonPolicies";

// Customers are told, at the moment they book, that essential messages are part
// of booking, that WhatsApp is used where possible with SMS as the fallback, and
// that promotions are separate.
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
    expect(notice).toHaveTextContent(/confirmations, reminders, any changes to it/i);
    expect(notice).toHaveTextContent(/ready for collection/i);
    expect(notice).toHaveTextContent(/WhatsApp where we can, and text you if it doesn.t reach you/i);
    expect(notice).toHaveTextContent(/promotions .* separately say yes/i);
  });
});
