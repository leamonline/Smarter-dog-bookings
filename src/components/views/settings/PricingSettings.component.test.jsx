import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { PricingSettings } from "./PricingSettings.jsx";

describe("PricingSettings read-only service matrix", () => {
  it("shows configured prices but disables edits without autosaving", () => {
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
    for (const input of screen.getAllByRole("spinbutton")) expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Full groom service" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Service name")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add service/i })).toBeDisabled();
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "45" } });
    expect(onUpdateConfig).not.toHaveBeenCalled();
    expect(screen.getByText(/Prices are read-only for now. Changes need a coordinated release/i)).toBeInTheDocument();
    expect(screen.getByText(/adding or removing a service uses that same process/i)).toBeInTheDocument();
  });
});
