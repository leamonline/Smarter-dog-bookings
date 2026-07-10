import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ServicesAddonsCard } from "./ServicesAddonsCard.jsx";
import { getServicePriceAmount } from "../../../engine/bookingRules";

// Derive the guide rate the same way the component does, so the test
// stays correct if the price table changes.
const GUIDE = getServicePriceAmount("full-groom", "large");

function renderCard({ price, customPrice, saveAsUsual = false } = {}) {
  return render(
    <ServicesAddonsCard
      booking={{ size: "large", service: "full-groom", dogName: "Alfie" }}
      isEditing
      editData={{ service: "full-groom", price, saveAsUsual, addons: [] }}
      setEditData={vi.fn()}
      setSaveError={vi.fn()}
      dogData={{ customPrice }}
      allowedServices={[{ id: "full-groom", name: "Full Groom" }]}
      sizeTheme={{ primary: "#000000" }}
      pricing={{ basePrice: price, amountDue: price, subtotal: price }}
      activeAddons={[]}
      activePayment="Unpaid"
      activeDepositAmount={0}
    />,
  );
}

describe("ServicesAddonsCard price hint (#307) and one-off price tick", () => {
  it("labels the price 'Standard price' when it matches the guide rate", () => {
    renderCard({ price: GUIDE });
    expect(screen.getByText("Standard price")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /usual price/i })).not.toBeInTheDocument();
  });

  it("flags a one-off price, shows the usual rate, and offers the save-as-usual tick (off)", () => {
    renderCard({ price: GUIDE + 5 });
    expect(
      screen.getByText(`One-off price for this booking — usual is £${GUIDE}`),
    ).toBeInTheDocument();
    const tick = screen.getByRole("checkbox", { name: /save as alfie.s usual price/i });
    expect(tick).not.toBeChecked();
  });

  it("labels the dog's saved usual price as usual (not one-off), noting the guide", () => {
    renderCard({ price: GUIDE + 8, customPrice: GUIDE + 8 });
    expect(
      screen.getByText(`Alfie's usual price (guide is £${GUIDE})`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /usual price/i })).not.toBeInTheDocument();
  });

  it("treats a zero customPrice as no usual price (guide is the anchor)", () => {
    renderCard({ price: GUIDE, customPrice: 0 });
    expect(screen.getByText("Standard price")).toBeInTheDocument();
  });

  it("falls back to dogData.size when booking.size is blank, so a standard price isn't mislabelled", () => {
    render(
      <ServicesAddonsCard
        booking={{ size: undefined, service: "full-groom", dogName: "Alfie" }}
        isEditing
        editData={{ service: "full-groom", price: GUIDE, saveAsUsual: false, addons: [] }}
        setEditData={vi.fn()}
        setSaveError={vi.fn()}
        dogData={{ size: "large" }}
        allowedServices={[{ id: "full-groom", name: "Full Groom" }]}
        sizeTheme={{ primary: "#000000" }}
        pricing={{ basePrice: GUIDE, amountDue: GUIDE, subtotal: GUIDE }}
        activeAddons={[]}
        activePayment="Unpaid"
        activeDepositAmount={0}
      />,
    );
    expect(screen.getByText("Standard price")).toBeInTheDocument();
  });
});
