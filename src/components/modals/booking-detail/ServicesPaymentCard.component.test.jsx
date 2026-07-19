import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { ServicesPaymentCard } from "./ServicesPaymentCard.jsx";

const serviceProps = {
  booking: { size: "medium", service: "full-groom", dogName: "Freddie" },
  isEditing: false,
  editData: { service: "full-groom", price: 46, saveAsUsual: false, addons: [] },
  setEditData: vi.fn(),
  setSaveError: vi.fn(),
  dogData: {},
  allowedServices: [{ id: "full-groom", name: "Full Groom" }],
  sizeTheme: { primary: "#006B5E" },
  pricing: { basePrice: 46, subtotal: 46, amountDue: 46 },
  activeAddons: [],
};

function renderCard({ booking, pricing }) {
  return render(
    <ToastProvider>
      <ServicesPaymentCard
        {...serviceProps}
        booking={booking}
        pricing={pricing}
        activeAddons={booking.addons}
        onUpdate={vi.fn()}
        currentDateStr="2026-07-13"
      />
    </ToastProvider>,
  );
}

describe("ServicesPaymentCard", () => {
  it("renders service, add-ons and the total once before payment", () => {
    renderCard({
      booking: {
        service: "full-groom",
        size: "medium",
        addons: ["Flea Bath"],
        payment: "Due at Pick-up",
      },
      pricing: { basePrice: 40, subtotal: 50, amountDue: 50 },
    });

    expect(screen.getByText("Full Groom")).toBeInTheDocument();
    expect(screen.getByText(/Flea Bath/)).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("£50")).toHaveLength(1);
    expect(screen.getByText("£50 to pay")).toBeInTheDocument();
  });
});
