// Guard tests for the unified Settings save model (P1 batch C): switching
// tabs while an explicit-save tab has unsaved edits must warn first.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("../../supabase/client.js", () => ({ supabase: null }));

import { SettingsView } from "./SettingsView.jsx";

function setViewportMobile(mobile) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: mobile && query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const baseProps = () => ({
  config: { businessName: "My Salon", businessPhone: "", businessEmail: "", businessAddress: "" },
  onUpdateConfig: vi.fn().mockResolvedValue({ ok: true }),
  user: { email: "a@b.com" },
  staffProfile: { id: "s1", display_name: "Sarah", phone: "" },
  canEdit: true,
});

describe("SettingsView unsaved-changes guard", () => {
  beforeEach(() => setViewportMobile(false));

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

    expect(screen.getByText(/upcoming policy/i)).toBeInTheDocument();
  });

  it("switches freely when there are no unsaved edits", async () => {
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    await user.click(screen.getByRole("tab", { name: /booking rules/i }));
    expect(screen.queryByText(/discard unsaved changes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/upcoming policy/i)).toBeInTheDocument();
  });

  it("keeps the desktop tab order and moves from Hours to Account with ArrowRight", async () => {
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Your Business",
      "Hours & Closures",
      "Your Account",
      "Services & Pricing",
      "Booking Rules",
      "Capacity Engine",
      "Customer Portal",
      "Notifications",
      "Calendar Sync",
    ]);

    await user.click(screen.getByRole("tab", { name: "Hours & Closures" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Your Account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Your Account" })).toHaveFocus();
  });

  it("keeps every section in the mobile header and uses the existing dirty-state guard", async () => {
    setViewportMobile(true);
    const user = userEvent.setup();
    render(<SettingsView {...baseProps()} />);

    expect(screen.getByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
    await user.type(screen.getByDisplayValue("My Salon"), "!");
    await user.click(screen.getByRole("tab", { name: "Booking Rules" }));
    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("tab", { name: "Your Business" })).toHaveAttribute("aria-selected", "true");
  });
});
