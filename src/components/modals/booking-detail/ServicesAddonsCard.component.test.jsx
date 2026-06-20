import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ServicesAddonsCard } from "./ServicesAddonsCard.jsx";
import { getNumericPrice, getServicePriceLabel } from "../../../engine/bookingRules";

// Derive the standard rate the same way the component does, so the test
// stays correct if the price table changes.
const STANDARD = getNumericPrice(getServicePriceLabel("full-groom", "large"));

function renderCard(customPrice) {
  return render(
    <ServicesAddonsCard
      booking={{ size: "large", service: "full-groom" }}
      isEditing
      editData={{ service: "full-groom", customPrice, addons: [] }}
      setEditData={vi.fn()}
      setSaveError={vi.fn()}
      dogData={{}}
      allowedServices={[{ id: "full-groom", name: "Full Groom" }]}
      sizeTheme={{ primary: "#000000" }}
      pricing={{ basePrice: customPrice, amountDue: customPrice, subtotal: customPrice }}
      activeAddons={[]}
      activePayment="Unpaid"
      activeDepositAmount={0}
    />,
  );
}

describe("ServicesAddonsCard price hint (#307)", () => {
  it("labels the price 'Standard price' when it matches the standard rate", () => {
    renderCard(STANDARD);
    expect(screen.getByText("Standard price")).toBeInTheDocument();
  });

  it("flags a custom override and shows the standard rate for reference", () => {
    renderCard(STANDARD + 5);
    expect(
      screen.getByText(`Custom price — standard is £${STANDARD}`),
    ).toBeInTheDocument();
  });

  it("falls back to dogData.size when booking.size is blank, so a standard price isn't mislabelled", () => {
    // booking.size missing but the dog is large; the standard rate must be
    // derived against "large" (matching how customPrice is seeded), not £0.
    render(
      <ServicesAddonsCard
        booking={{ size: undefined, service: "full-groom" }}
        isEditing
        editData={{ service: "full-groom", customPrice: STANDARD, addons: [] }}
        setEditData={vi.fn()}
        setSaveError={vi.fn()}
        dogData={{ size: "large" }}
        allowedServices={[{ id: "full-groom", name: "Full Groom" }]}
        sizeTheme={{ primary: "#000000" }}
        pricing={{ basePrice: STANDARD, amountDue: STANDARD, subtotal: STANDARD }}
        activeAddons={[]}
        activePayment="Unpaid"
        activeDepositAmount={0}
      />,
    );
    expect(screen.getByText("Standard price")).toBeInTheDocument();
  });
});
