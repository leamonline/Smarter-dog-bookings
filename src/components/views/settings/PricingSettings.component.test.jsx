import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { PricingSettings } from "./PricingSettings.jsx";

describe("PricingSettings read-only service matrix", () => {
  it("shows the persisted price matrix and gives staff the coordinated release path", () => {
    const onUpdateConfig = vi.fn();
    render(
      <PricingSettings
        config={{
          services: [{ id: "full-groom", name: "Full groom", icon: "✂️" }],
          pricing: { "full-groom": { small: 4250, medium: 5000, large: 6000 } },
        }}
        onUpdateConfig={onUpdateConfig}
        canEdit
      />,
    );

    expect(screen.getByText("Full groom")).toBeInTheDocument();
    const [smallPrice, mediumPrice, largePrice] = screen.getAllByRole("spinbutton");
    expect(smallPrice).toHaveValue(42.5);
    expect(mediumPrice).toHaveValue(50);
    expect(largePrice).toHaveValue(60);
    for (const input of [smallPrice, mediumPrice, largePrice]) expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Full groom service" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Service name")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add service/i })).toBeDisabled();
    fireEvent.change(smallPrice, { target: { value: "45" } });
    expect(onUpdateConfig).not.toHaveBeenCalled();
    expect(screen.getByText(/Prices are read-only for now/i)).toHaveTextContent(
      "Prices are read-only for now. Changes need a coordinated release; ask the owner and allow half a working day. Adding or removing a service uses that same process.",
    );
  });
});
