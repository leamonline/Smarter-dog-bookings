import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppToolbar } from "./AppToolbar.jsx";
import { MobileNavStrip } from "./MobileNavStrip.jsx";
import { PRIMARY_NAV } from "./navConfig.jsx";

// Both nav surfaces read live badge counts; hold them in mutable state so
// individual tests can vary them without re-mocking the modules.
const unreadState = { unread: 0 };
const signupState = { count: 0 };

vi.mock("../../supabase/hooks/useWhatsAppUnread", () => ({
  useWhatsAppUnread: () => unreadState,
}));

vi.mock("../../supabase/hooks/usePendingSignupsCount", () => ({
  usePendingSignupsCount: () => signupState,
}));

beforeEach(() => {
  unreadState.unread = 0;
  signupState.count = 0;
});

function renderToolbar(props = {}, { route = "/today" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppToolbar isOnline={false} currentDateStr="2026-08-26" {...props} />
    </MemoryRouter>,
  );
}

function renderStrip({ route = "/today" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MobileNavStrip currentDateStr="2026-08-26" />
    </MemoryRouter>,
  );
}

describe("AppToolbar", () => {
  it("renders every primary section as a labelled link in the Primary nav", () => {
    renderToolbar();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const item of PRIMARY_NAV.filter((entry) => !entry.ownerFeature)) {
      expect(within(nav).getByRole("link", { name: item.label })).toBeInTheDocument();
    }
    // The owner-gated Booking Desk stays hidden unless the feature is on.
    expect(within(nav).queryByRole("link", { name: "Booking Desk" })).toBeNull();
  });

  it("shows Booking Desk only when the workspace feature is enabled", () => {
    renderToolbar({ showBookingWorkspace: true });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Booking Desk" })).toBeInTheDocument();
  });

  it("marks the current section with one uniform quiet active state", () => {
    renderToolbar({}, { route: "/today" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const active = within(nav).getByRole("link", { name: "Daily Brief" });
    expect(active).toHaveAttribute("aria-current", "page");
    // The active treatment is the same soft purple tint for every section —
    // no per-section saturated fill (the quiet-nav contract).
    expect(active.className).toContain("bg-brand-purple/[0.07]");
    const inactive = within(nav).getByRole("link", { name: "Dogs" });
    expect(inactive).not.toHaveAttribute("aria-current", "page");
    expect(inactive.className).not.toContain("bg-brand-purple/[0.07]");
  });

  it("uses the same quiet active tint on every section, not per-section colours", () => {
    renderToolbar({}, { route: "/dogs" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const active = within(nav).getByRole("link", { name: "Dogs" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-brand-purple/[0.07]");
  });

  it("fires the New booking and New client handlers", () => {
    const onNewBooking = vi.fn();
    const onNewClient = vi.fn();
    renderToolbar({ onNewBooking, onNewClient });
    fireEvent.click(screen.getByRole("button", { name: "New booking (press N)" }));
    expect(onNewBooking).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "New client" }));
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });

  it("opens the tools menu with Needs Attention and Settings", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Tools and settings" }));
    const menu = screen.getByRole("menu", { name: "Tools and settings" });
    expect(within(menu).getByRole("button", { name: "Needs Attention" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("keeps the badge counts in the Inbox and Humans accessible names", () => {
    unreadState.unread = 12;
    signupState.count = 2;
    renderToolbar();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav).getByRole("link", { name: "Inbox — 12 to reply" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", {
        name: "Humans — 2 new customers awaiting approval",
      }),
    ).toBeInTheDocument();
  });
});

describe("MobileNavStrip", () => {
  it("renders the same primary sections with the uniform active tint", () => {
    renderStrip({ route: "/humans" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const item of PRIMARY_NAV.filter((entry) => !entry.ownerFeature)) {
      expect(within(nav).getByRole("link", { name: item.label })).toBeInTheDocument();
    }
    const active = within(nav).getByRole("link", { name: "Humans" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-brand-purple/[0.07]");
  });

  it("carries the unread badge into the Inbox tab's accessible name", () => {
    unreadState.unread = 3;
    renderStrip();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav).getByRole("link", { name: "Inbox — 3 to reply" }),
    ).toBeInTheDocument();
  });
});
