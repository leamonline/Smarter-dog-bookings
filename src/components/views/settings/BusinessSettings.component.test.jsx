// Validation + autosave-status tests for the explicit-save Business tab and an
// autosave tab (P1 batch C).

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { BusinessSettings } from "./BusinessSettings.jsx";
import { BookingRulesSettings } from "./BookingRulesSettings.jsx";

describe("BusinessSettings email validation", () => {
  const config = { businessName: "My Salon", businessPhone: "", businessEmail: "", businessAddress: "" };

  it("blocks save and shows an error for an invalid email", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<BusinessSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    await user.type(screen.getByPlaceholderText(/hello@smarterdog/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
    expect(onUpdateConfig).not.toHaveBeenCalled();
  });

  it("saves once the email is valid", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<BusinessSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    await user.type(screen.getByPlaceholderText(/hello@smarterdog/i), "hi@smarterdog.co.uk");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("autosave SaveStatus indicator", () => {
  it("shows '✓ Saved' after an autosave succeeds", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<BookingRulesSettings config={{ autoConfirm: true }} onUpdateConfig={onUpdateConfig} canEdit />);

    // Toggling auto-confirm triggers a live save.
    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(onUpdateConfig).toHaveBeenCalledTimes(1);
  });
});
