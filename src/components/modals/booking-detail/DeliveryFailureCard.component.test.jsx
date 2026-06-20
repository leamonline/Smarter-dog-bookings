import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DeliveryFailureCard } from "./DeliveryFailureCard.jsx";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
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
