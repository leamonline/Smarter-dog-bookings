// Guard tests for the unified Settings save model (P1 batch C): switching
// tabs while an explicit-save tab has unsaved edits must warn first.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("../../supabase/client.js", () => ({ supabase: null }));

import { SettingsView } from "./SettingsView.jsx";

const baseProps = () => ({
  config: { businessName: "My Salon", businessPhone: "", businessEmail: "", businessAddress: "" },
  onUpdateConfig: vi.fn().mockResolvedValue({ ok: true }),
  user: { email: "a@b.com" },
  staffProfile: { id: "s1", display_name: "Sarah", phone: "" },
  canEdit: true,
});

describe("SettingsView unsaved-changes guard", () => {
  it("warns before leaving a tab with unsaved edits, and 'Keep editing' stays put", async () => {
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    await user.type(screen.getByDisplayValue("My Salon"), "!");
    await user.click(screen.getByRole("tab", { name: /booking rules/i }));

    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.queryByText(/discard unsaved changes/i)).not.toBeInTheDocument();
    // still on Business with the edit intact
    expect(screen.getByDisplayValue("My Salon!")).toBeInTheDocument();
  });

  it("'Discard changes' leaves the dirty tab and switches", async () => {
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    await user.type(screen.getByDisplayValue("My Salon"), "!");
    await user.click(screen.getByRole("tab", { name: /booking rules/i }));
    await user.click(screen.getByRole("button", { name: /discard changes/i }));

    expect(screen.getByText(/advance booking window/i)).toBeInTheDocument();
  });

  it("switches freely when there are no unsaved edits", async () => {
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    await user.click(screen.getByRole("tab", { name: /booking rules/i }));
    expect(screen.queryByText(/discard unsaved changes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/advance booking window/i)).toBeInTheDocument();
  });
});
