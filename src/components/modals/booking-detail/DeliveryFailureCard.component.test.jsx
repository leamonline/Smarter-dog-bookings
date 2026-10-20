import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DeliveryFailureCard } from "./DeliveryFailureCard.jsx";

const toastShow = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}));

const resendMock = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("../../../supabase/hooks/useStaffMessaging", () => ({
  useStaffMessaging: () => ({ resendBookingNotification: resendMock }),
}));

const props = {
  booking: { id: "b1" },
  failures: [
    {
      trigger_type: "reminder",
      channel: "whatsapp",
      created_at: "2026-06-18T08:00:00Z",
    },
  ],
  primaryHuman: { id: "h1", fullName: "Jane Smith", phone: "+447700900123" },
  onUpdateHuman: vi.fn(),
};

describe("DeliveryFailureCard phone validation (#304)", () => {
  it("marks the input invalid and shows an error for a bad number", async () => {
    render(<DeliveryFailureCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /fix the number/i }));

    const input = screen.getByLabelText(/correct mobile number/i);
    expect(input).toHaveAttribute("aria-invalid", "false");

    await userEvent.clear(input);
    await userEvent.type(input, "abc");
    await userEvent.click(screen.getByRole("button", { name: /save number/i }));

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/valid uk mobile/i)).toBeInTheDocument();
  });

  it("uses a spaced UK placeholder", async () => {
    render(<DeliveryFailureCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /fix the number/i }));
    expect(screen.getByLabelText(/correct mobile number/i)).toHaveAttribute(
      "placeholder",
      "07700 900 123",
    );
  });
});

// A Twilio WhatsApp accept has no delivery receipt here, so the row is reaped
// to 'failed' only so the SMS safety net can chase it (#1017). The card must
// not tell staff the message didn't arrive when nobody knows that.
describe("DeliveryFailureCard: unconfirmed is not failed", () => {
  const unconfirmed = {
    trigger_type: "cancelled",
    channel: "whatsapp",
    created_at: "2026-10-14T09:00:00Z",
    error_message:
      "Delivery unconfirmed: Twilio accepted this WhatsApp but cannot report whether it arrived. If the customer accepts texts, the same message follows by SMS about an hour later.",
  };

  it("says 'not confirmed as delivered' when every failure is unconfirmed", () => {
    render(<DeliveryFailureCard {...props} failures={[unconfirmed]} />);
    expect(screen.getByText("Cancellation not confirmed as delivered")).toBeInTheDocument();
    expect(screen.queryByText(/didn't reach the customer/i)).toBeNull();
  });

  it("still says 'didn't reach' when a reported failure is present", () => {
    render(
      <DeliveryFailureCard
        {...props}
        failures={[unconfirmed, { trigger_type: "reminder", channel: "whatsapp", error_message: "WhatsApp could not deliver this (Meta 131026)." }]}
      />,
    );
    expect(screen.getByText("Some messages didn't reach the customer")).toBeInTheDocument();
  });
});

// The safety net logs its SMS as `<notice>_sms_fallback`; the resend function
// accepts only the notice itself, so a raw fallback trigger would be refused.
describe("DeliveryFailureCard: resending an SMS fallback row", () => {
  it("resends the notice the fallback carried, once", async () => {
    resendMock.mockClear();
    render(
      <DeliveryFailureCard
        {...props}
        failures={[
          { trigger_type: "cancelled", channel: "whatsapp", created_at: "2026-10-14T09:00:00Z" },
          { trigger_type: "cancelled_sms_fallback", channel: "sms", created_at: "2026-10-14T10:00:00Z" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /resend message/i }));
    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(resendMock).toHaveBeenCalledWith("b1", "cancelled");
  });
});

describe("DeliveryFailureCard: an expired login", () => {
  it("asks staff to sign in again instead of showing 'invalid token'", async () => {
    resendMock.mockClear();
    toastShow.mockClear();
    resendMock.mockResolvedValueOnce({
      error: {
        message: "non-2xx",
        context: { status: 401, json: async () => ({ error: "invalid token" }) },
      },
    });
    render(<DeliveryFailureCard {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /resend message/i }));
    const shown = toastShow.mock.calls.map((c) => c[0]).join(" | ");
    expect(shown).toContain("Your login has expired. Please sign in again.");
    expect(shown).not.toContain("invalid token");
  });
});

describe("DeliveryFailureCard with only a retired ready text (#997)", () => {
  it("offers no resend, so it cannot claim a resend that never happened", () => {
    render(
      <DeliveryFailureCard
        {...props}
        failures={[{ trigger_type: "ready", channel: "sms", created_at: "2026-06-18T08:00:00Z" }]}
      />,
    );
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
  });
});
